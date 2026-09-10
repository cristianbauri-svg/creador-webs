// Endpoint de subida de imágenes a R2
// POST /api/upload — recibe FormData con campo "file"
import { json, error } from "../utils/response";
import type { Env } from "../index";

const ALLOWED_TYPES = ["image/webp", "image/jpeg", "image/png"];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_FOLDERS = ["products", "avatars", "events", "hero", "cards"];

// Anchos de las variantes responsive. Deben coincidir con los que declara
// imgVariants() en public/js/app.js: si allí se anuncia una variante que no
// existe en R2, el navegador recibe un 404 y NO cae de vuelta al src, así que
// la imagen desaparece del bloque (Cards, Galería).
const VARIANT_WIDTHS = [640, 1280];

/** Firma real del archivo (PNG, JPEG o WebP). */
function hasImageSignature(bytes: Uint8Array): boolean {
  const isPNG = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
  const isJPEG = bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF;
  // RIFF....WEBP
  const isWebP = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
                 bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  return isPNG || isJPEG || isWebP;
}

/** Firma WebP únicamente, para validar las variantes. */
function isWebP(bytes: Uint8Array): boolean {
  return bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
         bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
}

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

  if (!hasImageSignature(bytes)) {
    return error("Tipo de archivo no válido. Solo se permiten PNG, JPEG y WebP.", 400);
  }

  // Carpeta de destino: el admin puede especificar un folder en el FormData.
  // Si no se especifica o no es válido, se usa "products" por defecto.
  const folderInput = (formData.get("folder") as string) || "products";
  const folder = ALLOWED_FOLDERS.includes(folderInput) ? folderInput : "products";

  // Generar nombre único
  const ext = file.type.split("/")[1] || "jpg";
  const baseId = crypto.randomUUID();
  const key = `${folder}/${baseId}.${ext}`;

  // Variantes responsive opcionales (variant_640 / variant_1280). Las genera el
  // navegador del admin con canvas y describen exactamente los anchos que
  // anuncia imgVariants() en public/js/app.js. Solo aplican cuando el original
  // es .webp: ese es el único caso en que aquel emite srcset. Si no vienen, el
  // comportamiento es idéntico al de antes: se sube solo el original.
  const variants: Array<{ width: number; file: File }> = [];
  if (ext === "webp") {
    for (const width of VARIANT_WIDTHS) {
      const variant = formData.get(`variant_${width}`);
      if (!variant || !(variant instanceof File)) continue;

      if (variant.size > MAX_SIZE) {
        return error(`La variante ${width} excede el tamaño máximo de 5 MB`, 400);
      }
      const variantHeader = new Uint8Array(await variant.arrayBuffer()).slice(0, 12);
      if (!isWebP(variantHeader)) {
        return error(`La variante ${width} no es un WebP válido`, 400);
      }
      variants.push({ width, file: variant });
    }
  }

  try {
    await env.STRATON_BUCKET.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type,
      },
    });

    // Se guardan como <uuid>-<ancho>.webp junto al original, que es justo la
    // ruta que el srcset construye a partir de la URL del original.
    for (const variant of variants) {
      await env.STRATON_BUCKET.put(`${folder}/${baseId}-${variant.width}.webp`, variant.file.stream(), {
        httpMetadata: {
          contentType: "image/webp",
        },
      });
    }

    // Ruta relativa: se resuelve contra el origen actual (local o producción),
    // así nunca queda un host/puerto de desarrollo grabado permanentemente en D1.
    const url = `/api/media/${key}`;

    return json(
      {
        url,
        key,
        content_type: file.type,
        size: file.size,
        // Anchos de las variantes efectivamente guardadas (vacío si el
        // original no es .webp o si el navegador no las pudo generar).
        variants: variants.map((v) => `/api/media/${folder}/${baseId}-${v.width}.webp`),
      },
      201
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Error al subir a R2";
    console.error("R2 upload error:", message);
    return error(message, 500);
  }
}
