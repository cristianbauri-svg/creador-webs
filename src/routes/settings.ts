// API de configuraciones del sitio
// Almacena pares key-value en KV (STRATON_KV)
import { json, error } from "../utils/response";
import type { Env } from "../index";

// Lista de claves de configuración permitidas (GET y PUT)
const KNOWN_KEYS = [
  "site_name",
  "site_description",
  "contact_email",
  "contact_phone",
  "contact_address",
  "social_instagram",
  "social_facebook",
  "social_tiktok",
  "whatsapp_number",
  "business_hours",
  "hero_title",
  "hero_subtitle",
];

/**
 * GET /api/settings — devuelve todas las configuraciones como JSON
 * PUT /api/settings — actualiza configuraciones (body: { key: value, ... })
 */
export async function handleSettings(request: Request, env: Env, _pathname: string): Promise<Response> {
  const method = request.method;

  if (method === "GET") return getSettings(env);
  if (method === "PUT") return updateSettings(request, env);

  return error("Method not allowed", 405);
}

async function getSettings(env: Env): Promise<Response> {
  try {
    // Las 12 claves se piden a la vez: en serie cada lectura arrastraba su
    // propio viaje al almacén de KV y la respuesta llegaba a tardar ~1,5 s en
    // frío, justo cuando la home la necesita para pintar el hero.
    const values = await Promise.all(KNOWN_KEYS.map((key) => env.STRATON_KV.get(key)));

    const settings: Record<string, string> = {};
    KNOWN_KEYS.forEach((key, index) => {
      const value = values[index];
      if (value !== null) {
        settings[key] = value;
      }
    });

    return json(settings);
  } catch (e) {
    const message = e instanceof Error ? e.message : "KV error";
    return error(message, 500);
  }
}

async function updateSettings(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as Record<string, unknown>;

    const invalidKeys = Object.keys(body).filter((key) => !KNOWN_KEYS.includes(key));
    if (invalidKeys.length > 0) {
      return error(`Claves no permitidas: ${invalidKeys.join(", ")}`, 400);
    }

    const ops: Promise<void>[] = [];
    for (const [key, value] of Object.entries(body)) {
      if (typeof value === "string") {
        ops.push(env.STRATON_KV.put(key, value));
      } else if (value !== null && value !== undefined) {
        ops.push(env.STRATON_KV.put(key, JSON.stringify(value)));
      }
    }

    await Promise.all(ops);
    return json({ success: true, updated: Object.keys(body).length });
  } catch (e) {
    const message = e instanceof Error ? e.message : "KV error";
    return error(message, 500);
  }
}
