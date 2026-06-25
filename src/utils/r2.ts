// Helpers para R2 (stubs por ahora)
// En futuras iteraciones: presigned URLs, uploads, etc.

import { error } from "./response";
import type { Env } from "../index";

/**
 * Genera una URL pública para un objeto en R2.
 * Implementación futura: presigned URLs via Cloudflare Access.
 */
export function getPublicUrl(key: string): string {
  // TODO: implementar presigned URLs cuando se configure el dominio
  return `/api/media/${key}`;
}

/**
 * Sube un archivo a R2.
 * Stub: retorna la key del objeto.
 */
export async function uploadFile(
  _env: Env,
  key: string,
  _body: ArrayBuffer | ReadableStream,
  _contentType: string
): Promise<{ key: string } | Response> {
  // TODO: implementar cuando se necesiten uploads
  console.log(`[R2 stub] upload ${key}`);
  return { key };
}

export function handleR2Error(e: unknown): Response {
  const message = e instanceof Error ? e.message : "R2 storage error";
  console.error("R2 error:", message);
  return error(message, 500);
}
