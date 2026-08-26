// Endpoint para servir archivos desde R2
// GET /api/media/{key} — devuelve el objeto almacenado en el bucket
import type { Env } from "../index";

// Prefijos permitidos para servir desde R2.
// Deben coincidir con ALLOWED_FOLDERS en src/routes/upload.ts.
const ALLOWED_PREFIXES = ["products/", "avatars/", "events/", "hero/", "cards/"];

function withNosniff(body: BodyInit | null, init: ResponseInit): Response {
  const headers = new Headers(init.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(body, { ...init, headers });
}

function buildHeaders(object: R2Object): Headers {
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("ETag", object.httpEtag);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return headers;
}

export async function handleMedia(
  request: Request,
  env: Env,
  pathname: string,
  ctx: ExecutionContext
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return withNosniff("Method not allowed", { status: 405 });
  }

  // Extraer la key del pathname: /api/media/products/uuid.webp => products/uuid.webp
  const key = pathname.slice("/api/media/".length);

  if (!key) {
    return withNosniff("Missing key", { status: 400 });
  }

  const isAllowed = ALLOWED_PREFIXES.some((prefix) => key.startsWith(prefix));
  if (!isAllowed) {
    return withNosniff("Forbidden", { status: 403 });
  }

  // Cache de edge de Cloudflare: evita ir a R2 en cada request desde
  // cualquier colo. La key de cache es la URL completa del request.
  const cache = caches.default;
  const cacheKey = new Request(request.url, request);
  const cached = await cache.match(cacheKey);
  if (cached) {
    return cached;
  }

  // R2 espera el ETag sin comillas ni prefijo "W/", pero el header
  // If-None-Match del navegador llega citado (p.ej. `"abc123"`).
  const ifNoneMatchRaw = request.headers.get("If-None-Match");
  const ifNoneMatch = ifNoneMatchRaw
    ? ifNoneMatchRaw.replace(/^W\//, "").replace(/^"|"$/g, "")
    : null;
  const object: R2ObjectBody | R2Object | null = ifNoneMatch
    ? await env.STRATON_BUCKET.get(key, { onlyIf: { etagDoesNotMatch: ifNoneMatch } })
    : await env.STRATON_BUCKET.get(key);

  if (!object) {
    return withNosniff("Not found", { status: 404 });
  }

  const headers = buildHeaders(object);
  headers.set("Content-Length", String(object.size));

  const body = (object as R2ObjectBody).body;
  if (!body) {
    // onlyIf coincidió (etag sin cambios): objeto no modificado.
    return withNosniff(null, { status: 304, headers });
  }

  const response = new Response(body, { headers });

  ctx.waitUntil(cache.put(cacheKey, response.clone()));

  return response;
}
