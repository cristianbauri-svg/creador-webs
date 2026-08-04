// Helpers para R2 — solo utilidades necesarias
// La lógica real de upload está en src/routes/upload.ts

import type { Env } from "../index";
import { error } from "./response";

/**
 * Extrae la key de R2 de una URL de media relativa.
 * Ej: "/api/media/products/uuid.webp" → "products/uuid.webp"
 * Retorna null si la URL no tiene el formato esperado.
 */
export function extractR2Key(url: string): string | null {
  const match = url.match(/^\/api\/media\/(.+)$/);
  return match ? match[1] : null;
}

/**
 * Elimina un objeto de R2 de forma asíncrona (fire-and-forget).
 * Los errores se loguean pero no interrumpen el flujo principal.
 */
export function deleteR2Object(url: string, env: Env): void {
  const key = extractR2Key(url);
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
