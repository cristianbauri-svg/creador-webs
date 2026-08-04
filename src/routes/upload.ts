// Endpoint de subida de imágenes a R2
// POST /api/upload — recibe FormData con campo "file"
import { json, error } from "../utils/response";
import type { Env } from "../index";

const ALLOWED_TYPES = ["image/webp", "image/jpeg", "image/png"];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_FOLDERS = ["products", "avatars", "events", "hero", "cards"];

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

  // Validar magic bytes (firma real del archivo)
  const arr = await file.arrayBuffer();
  const bytes = new Uint8Array(arr);
  const header = bytes.slice(0, 12);

  // Firmas: PNG, JPEG, WebP
  const isPNG = header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4E && header[3] === 0x47;
  const isJPEG = header[0] === 0xFF && header[1] === 0xD8 && header[2] === 0xFF;
  const isWebP = header[0] === 0x52 && header[1] === 0x49 && header[2] === 0x46 && header[3] === 0x46 &&
                 header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50;

  if (!isPNG && !isJPEG && !isWebP) {
    return error("Tipo de archivo no válido. Solo se permiten PNG, JPEG y WebP.", 400);
  }

  // Carpeta de destino: el admin puede especificar un folder en el FormData.
  // Si no se especifica o no es válido, se usa "products" por defecto.
  const folderInput = (formData.get("folder") as string) || "products";
  const folder = ALLOWED_FOLDERS.includes(folderInput) ? folderInput : "products";

  // Generar nombre único
  const ext = file.type.split("/")[1] || "jpg";
  const key = `${folder}/${crypto.randomUUID()}.${ext}`;

  try {
    await env.STRATON_BUCKET.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type,
      },
    });

    // Ruta relativa: se resuelve contra el origen actual (local o producción),
    // así nunca queda un host/puerto de desarrollo grabado permanentemente en D1.
    const url = `/api/media/${key}`;

    return json({ url, key, content_type: file.type, size: file.size }, 201);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al subir a R2";
    console.error("R2 upload error:", message);
    return error(message, 500);
  }
}
