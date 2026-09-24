// Política de acceso de la API: qué peticiones exigen una sesión de
// administrador (Cloudflare Access) y cuáles son públicas.
//
// La regla es cerrada por defecto: toda petición que puede modificar algo
// exige sesión, salvo la única escritura pública del sitio (el formulario de
// cotización). Una ruta nueva nace protegida sin tener que añadirla a ninguna
// lista.

import { validateAccess } from "./auth";
import type { Env } from "../index";

/** Métodos que solo leen. Cualquier otro (POST, PUT, PATCH, DELETE…) escribe. */
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Único estado que ve el público. */
export const PUBLIC_STATUS = "published";

/** ¿La petición exige una sesión de administrador? */
export function requiresAdmin(method: string, url: URL): boolean {
  const { pathname } = url;

  // Escrituras: todas protegidas, salvo enviar una cotización desde el sitio.
  if (!READ_METHODS.has(method)) {
    return !(method === "POST" && pathname === "/api/quotations");
  }

  // Lecturas de cotizaciones: contienen datos personales de clientes. Mismo
  // prefijo que usa el dispatcher de handleApi para enrutarlas.
  if (pathname.startsWith("/api/quotations")) {
    return true;
  }

  // Pedir algo distinto de lo publicado (?status=all, ?status=draft…) es una
  // consulta del panel: el público solo ve contenido publicado.
  const status = url.searchParams.get("status");
  return status !== null && status !== "" && status !== PUBLIC_STATUS;
}

/** Comprobación de sesión de administrador, perezosa y memorizada: el JWT
 *  solo se verifica si una ruta lo necesita, y como mucho una vez. */
export interface AccessCheck {
  isAdmin(): Promise<boolean>;
}

export function createAccessCheck(request: Request, env: Env): AccessCheck {
  let result: Promise<boolean> | null = null;
  return {
    isAdmin() {
      if (!result) result = validateAccess(request, env);
      return result;
    },
  };
}
