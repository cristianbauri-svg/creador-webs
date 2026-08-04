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

export async function handleMedia(
  request: Request,
  env: Env,
  pathname: string
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

  const object = await env.STRATON_BUCKET.get(key);

  if (!object) {
    return withNosniff("Not found", { status: 404 });
  }

  const headers = new Headers();
  headers.set(
    "Content-Type",
    object.httpMetadata?.contentType || "application/octet-stream"
  );
  headers.set("Cache-Control", "public, max-age=31536000");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  return new Response(object.body, { headers });
}
