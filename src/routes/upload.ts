// Endpoint de subida de imágenes a R2
// POST /api/upload — recibe FormData con campo "file"
import { json, error } from "../utils/response";
import type { Env } from "../index";

const ALLOWED_TYPES = ["image/webp", "image/jpeg", "image/png"];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

export async function handleUpload(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") {
    return error("Method not allowed", 405);
  }

  // Verificar que el bucket esté configurado
  if (!env.STRATON_BUCKET) {
    return error("R2 bucket no está configurado. Verifica wrangler.jsonc.", 500);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return error("El body debe ser FormData con un campo 'file'", 400);
  }

  const file = formData.get("file");

  if (!file || !(file instanceof File)) {
    return error("Campo 'file' es requerido y debe ser un archivo", 400);
  }

  // Validar tipo MIME
  if (!ALLOWED_TYPES.includes(file.type)) {
    return error(
      `Tipo de archivo no permitido: ${file.type}. Usa: ${ALLOWED_TYPES.join(", ")}`,
      400
    );
  }

  // Validar tamaño
  if (file.size > MAX_SIZE) {
    return error(
      `El archivo excede el tamaño máximo de 5 MB (${(file.size / 1024 / 1024).toFixed(1)} MB)`,
      400
    );
  }

  // Generar nombre único
  const ext = file.type.split("/")[1] || "jpg";
  const key = `products/${crypto.randomUUID()}.${ext}`;

  try {
    await env.STRATON_BUCKET.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type,
      },
    });

    // URL pública absoluta — en producción se configura un dominio personalizado para el bucket
    const url = new URL(`/api/media/${key}`, request.url).href;

    return json({ url, key, content_type: file.type, size: file.size }, 201);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al subir a R2";
    console.error("R2 upload error:", message);
    return error(message, 500);
  }
}
