// Endpoint para servir archivos desde R2
// GET /api/media/{key} — devuelve el objeto almacenado en el bucket
import type { Env } from "../index";

// Único prefijo que src/routes/upload.ts escribe actualmente en R2.
// Si se añade un nuevo prefijo de subida, hay que sumarlo aquí también.
const ALLOWED_PREFIXES = ["products/"];

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

  return new Response(object.body, { headers });
}
