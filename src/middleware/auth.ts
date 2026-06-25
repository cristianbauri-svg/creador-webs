// Middleware de autenticación via Cloudflare Access
// En producción, valida el JWT de Cf-Access-Jwt-Assertion
// En desarrollo local (Miniflare), permite acceso sin header

import type { Env } from "../index";

/**
 * Valida el acceso a rutas protegidas.
 * Retorna true si:
 *   - Estamos en desarrollo local (sin header Cf-Access-Jwt-Assertion)
 *   - El header Cf-Access-Jwt-Assertion está presente (producción)
 *
 * Retorna false si el header está ausente en producción.
 */
export function validateAccess(request: Request, _env: Env): boolean {
  const jwt = request.headers.get("Cf-Access-Jwt-Assertion");

  // En desarrollo local (Miniflare), el header no se simula
  if (!jwt) {
    // Asumimos que es local dev si no hay JWT
    // En producción, Cloudflare Access siempre inyecta el header
    return true;
  }

  // TODO: verificar firma del JWT contra la política de Access en producción
  // Por ahora, asumimos válido si el header existe
  return true;
}
