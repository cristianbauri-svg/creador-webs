// Helpers para R2 — solo utilidades necesarias
// La lógica real de upload está en src/routes/upload.ts

import { error } from "./response";

export function handleR2Error(e: unknown): Response {
  const message = e instanceof Error ? e.message : "R2 storage error";
  console.error("R2 error:", message);
  return error(message, 500);
}
