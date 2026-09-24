// Helpers para R2 — solo utilidades necesarias
// La lógica real de upload está en src/routes/upload.ts

import type { Env } from "../index";
import { error } from "./response";

/** Carpetas que sirve /api/media. Espejo de ALLOWED_PREFIXES en
 *  routes/media.ts y de ALLOWED_FOLDERS en routes/upload.ts. */
export const MEDIA_FOLDERS: readonly string[] = ["products", "avatars", "events", "hero", "cards"];

/** URL de una imagen tal como la devuelve /api/upload:
 *  /api/media/<carpeta>/<nombre>.<webp|jpeg|jpg|png>.
 *  El nombre no admite puntos, barras, "%" ni "\": no hay forma de salir de la
 *  carpeta (../, %2e%2e, %2f) ni de apuntar a una subcarpeta. */
const MEDIA_IMAGE_URL = /^\/api\/media\/([a-z]+)\/([A-Za-z0-9_-]+\.(?:webp|jpe?g|png))$/;

/**
 * Clave de R2 de una URL de imagen, o null si la URL no es exactamente una
 * imagen de una de las carpetas permitidas.
 * Ej: ("/api/media/events/uuid.webp", ["events"]) → "events/uuid.webp"
 */
export function mediaKeyFromUrl(url: unknown, allowedFolders: readonly string[]): string | null {
  if (typeof url !== "string") return null;
  const match = url.match(MEDIA_IMAGE_URL);
  if (!match || !allowedFolders.includes(match[1])) return null;
  return `${match[1]}/${match[2]}`;
}

/** ¿Es una URL de imagen servida por /api/media? */
export function isMediaImageUrl(url: unknown): boolean {
  return mediaKeyFromUrl(url, MEDIA_FOLDERS) !== null;
}

/**
 * Elimina de R2 la imagen de `url` de forma asíncrona (fire-and-forget).
 * Solo actúa si la URL es una imagen válida de `allowedFolders`: cada entidad
 * declara su carpeta y no puede borrar nada fuera de ella. Cualquier otro
 * valor se ignora. Los errores se loguean pero no interrumpen el flujo.
 */
export function deleteR2Object(url: unknown, env: Env, allowedFolders: readonly string[]): void {
  const key = mediaKeyFromUrl(url, allowedFolders);
  if (!key) return;
  // Fire-and-forget: no bloqueamos la respuesta esperando la eliminación
  env.STRATON_BUCKET.delete(key).catch((e: unknown) => {
    console.error("Error eliminando objeto huérfano de R2:", key, e);
  });
}

export function handleR2Error(e: unknown): Response {
  const message = e instanceof Error ? e.message : "R2 storage error";
  console.error("R2 error:", message);
  return error(message, 500);
}
