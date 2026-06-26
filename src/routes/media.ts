// Endpoint para servir archivos desde R2
// GET /api/media/{key} — devuelve el objeto almacenado en el bucket
import type { Env } from "../index";

export async function handleMedia(
  request: Request,
  env: Env,
  pathname: string
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Extraer la key del pathname: /api/media/products/uuid.webp => products/uuid.webp
  const key = pathname.slice("/api/media/".length);

  if (!key) {
    return new Response("Missing key", { status: 400 });
  }

  const object = await env.STRATON_BUCKET.get(key);

  if (!object) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers();
  headers.set(
    "Content-Type",
    object.httpMetadata?.contentType || "application/octet-stream"
  );
  headers.set("Cache-Control", "public, max-age=31536000");

  return new Response(object.body, { headers });
}
