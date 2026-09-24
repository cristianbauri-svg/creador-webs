// CRUD de eventos
import { json, error } from "../utils/response";
import { queryAll, queryOne, execute, handleDbError } from "../utils/d1";
import { deleteR2Object, isMediaImageUrl } from "../utils/r2";
import { PUBLIC_STATUS, type AccessCheck } from "../middleware/access";
import type { Env } from "../index";

/** Mismos valores que el CHECK de la columna en D1 (migrations/006_events.sql). */
const EVENT_TYPES = ["corporativo", "social", "concierto"];
const EVENT_STATUSES = ["draft", "published"];

/** Carpeta de R2 cuyas imágenes puede borrar un evento. El panel sube las
 *  imágenes nuevas de eventos (antes, después y galería) a events/. Las
 *  referencias históricas que apuntan a products/ u otras carpetas no se
 *  borran automáticamente: un evento solo borra imágenes de events/, así que
 *  nunca borra una imagen que pueda pertenecer a otra entidad. */
const EVENT_MEDIA_FOLDERS = ["events"];

const MAX_TITLE = 200; // mismo maxlength que el formulario del panel
const MAX_TEXT = 5000;
const MAX_LINK = 2048;
const MAX_GALLERY = 50;

export async function handleEvents(request: Request, env: Env, pathname: string, access: AccessCheck): Promise<Response> {
  const method = request.method;

  const match = pathname.match(/^\/api\/events\/(\d+)$/);
  if (match) {
    const id = parseInt(match[1], 10);
    if (method === "GET") return getEvent(env, id, access);
    if (method === "PUT") return updateEvent(request, env, id);
    if (method === "DELETE") return deleteEvent(env, id);
    return error("Method not allowed", 405);
  }

  if (method === "GET") return listEvents(request, env);
  if (method === "POST") return createEvent(request, env);
  return error("Method not allowed", 405);
}

/** Enlace de la card: URL absoluta http(s), sin espacios, comillas ni "<>". */
function isSafeLink(value: string): boolean {
  if (value.length > MAX_LINK || /[\s"'<>`\\\u0000-\u001f\u007f]/.test(value)) return false;
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || protocol === "http:";
  } catch {
    return false;
  }
}

/** gallery_json: arreglo JSON de URLs de imagen de /api/media. */
function isValidGallery(value: string): boolean {
  let gallery: unknown;
  try {
    gallery = JSON.parse(value);
  } catch {
    return false;
  }
  return Array.isArray(gallery) && gallery.length <= MAX_GALLERY && gallery.every(isMediaImageUrl);
}

/** Campos opcionales: vacío ("" o null) se guarda como null; con valor, se valida. */
const OPTIONAL_FIELDS: Array<[field: string, isValid: (value: unknown) => boolean, message: string]> = [
  ["event_type", (v) => typeof v === "string" && EVENT_TYPES.includes(v), `Invalid event_type. Must be one of: ${EVENT_TYPES.join(", ")}`],
  ["solution", (v) => typeof v === "string" && v.length <= MAX_TEXT, `solution debe ser texto de hasta ${MAX_TEXT} caracteres`],
  ["result", (v) => typeof v === "string" && v.length <= MAX_TEXT, `result debe ser texto de hasta ${MAX_TEXT} caracteres`],
  ["before_media_url", isMediaImageUrl, "before_media_url debe ser una imagen de /api/media"],
  ["after_media_url", isMediaImageUrl, "after_media_url debe ser una imagen de /api/media"],
  ["gallery_json", (v) => typeof v === "string" && isValidGallery(v), "gallery_json debe ser un arreglo JSON de imágenes de /api/media"],
  ["link", (v) => typeof v === "string" && isSafeLink(v), "link debe ser una URL http(s) válida"],
];

type EventInput = { ok: true; fields: Record<string, string | null> } | { ok: false; error: string };

/**
 * Valida el cuerpo de un evento. Crear y actualizar aplican exactamente las
 * mismas reglas: al actualizar (`partial`) los campos ausentes no se tocan, y
 * al crear se completan con los valores por defecto de siempre (status
 * "draft", opcionales en null). Un UPDATE no acepta nada que un CREATE
 * rechazaría.
 */
function parseEventInput(body: unknown, partial: boolean): EventInput {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "El cuerpo debe ser un objeto JSON" };
  }
  const b = body as Record<string, unknown>;
  const fields: Record<string, string | null> = {};

  if (!partial || b.title !== undefined) {
    if (typeof b.title !== "string" || !b.title.trim()) return { ok: false, error: "title is required" };
    if (b.title.length > MAX_TITLE) return { ok: false, error: `title admite como máximo ${MAX_TITLE} caracteres` };
    fields.title = b.title;
  }

  if (!partial || b.status !== undefined) {
    if (!partial && (b.status === undefined || b.status === null || b.status === "")) {
      fields.status = "draft";
    } else if (typeof b.status === "string" && EVENT_STATUSES.includes(b.status)) {
      fields.status = b.status;
    } else {
      return { ok: false, error: `Invalid status. Must be one of: ${EVENT_STATUSES.join(", ")}` };
    }
  }

  for (const [field, isValid, message] of OPTIONAL_FIELDS) {
    const value = b[field];
    if (partial && value === undefined) continue;
    if (value === undefined || value === null || value === "") fields[field] = null;
    else if (isValid(value)) fields[field] = value as string;
    else return { ok: false, error: message };
  }

  return { ok: true, fields };
}

/** Cuerpo JSON de la petición, o undefined si no es JSON válido. */
async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

async function listEvents(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const eventType = url.searchParams.get("event_type");
    const status = url.searchParams.get("status");
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get("per_page") || "20")));
    const offset = (page - 1) * perPage;

    let whereClause = "WHERE 1=1";
    const params: unknown[] = [];
    if (eventType) {
      whereClause += " AND event_type = ?";
      params.push(eventType);
    }
    // Por defecto solo publicados (endpoint público).
    // ?status=all permite al admin ver borradores.
    if (status === "all") {
      // sin filtro adicional
    } else if (status) {
      whereClause += " AND status = ?";
      params.push(status);
    } else {
      whereClause += " AND status = 'published'";
    }

    const countResult = await queryOne(env.STRATON_DB, `SELECT COUNT(*) as total FROM events ${whereClause}`, params);
    const total = (countResult?.total as number) || 0;

    const rows = await queryAll(env.STRATON_DB, `SELECT * FROM events ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`, [...params, perPage, offset]);

    return new Response(JSON.stringify(rows), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "X-Total-Count": String(total),
        "X-Page": String(page),
        "X-Per-Page": String(perPage),
      },
    });
  } catch (e) {
    return handleDbError(e, env);
  }
}

async function getEvent(env: Env, id: number, access: AccessCheck): Promise<Response> {
  try {
    const row = await queryOne(env.STRATON_DB, "SELECT * FROM events WHERE id = ?", [id]);
    // Un borrador solo existe para el panel: al público se le responde igual
    // que si no existiera.
    if (!row || (row.status !== PUBLIC_STATUS && !(await access.isAdmin()))) {
      return error("Event not found", 404);
    }
    return json(row);
  } catch (e) {
    return handleDbError(e, env);
  }
}

async function createEvent(request: Request, env: Env): Promise<Response> {
  try {
    const input = parseEventInput(await readJson(request), false);
    if (!input.ok) return error(input.error, 400);
    const f = input.fields;

    const result = await execute(
      env.STRATON_DB,
      `INSERT INTO events (title, event_type, solution, result, before_media_url, after_media_url, gallery_json, status, link)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [f.title, f.event_type, f.solution, f.result, f.before_media_url, f.after_media_url, f.gallery_json, f.status, f.link]
    );

    const inserted = await queryOne(env.STRATON_DB, "SELECT * FROM events WHERE id = ?", [result.meta.last_row_id]);
    return json(inserted, 201);
  } catch (e) {
    return handleDbError(e, env);
  }
}

async function updateEvent(request: Request, env: Env, id: number): Promise<Response> {
  try {
    const existing = await queryOne(env.STRATON_DB, "SELECT * FROM events WHERE id = ?", [id]);
    if (!existing) return error("Event not found", 404);

    const input = parseEventInput(await readJson(request), true);
    if (!input.ok) return error(input.error, 400);
    // Los nombres de columna salen de la validación, nunca del cuerpo.
    const entries = Object.entries(input.fields);
    if (entries.length === 0) return error("No fields to update", 400);

    await execute(
      env.STRATON_DB,
      `UPDATE events SET ${entries.map(([field]) => `${field} = ?`).join(", ")} WHERE id = ?`,
      [...entries.map(([, value]) => value), id]
    );

    // Imágenes reemplazadas: se borran de R2 después de guardar, y solo si
    // viven en la carpeta de eventos. El valor anterior sale del registro en
    // D1, no de la petición.
    for (const field of ["before_media_url", "after_media_url"]) {
      if (field in input.fields && existing[field] && existing[field] !== input.fields[field]) {
        deleteR2Object(existing[field], env, EVENT_MEDIA_FOLDERS);
      }
    }

    const updated = await queryOne(env.STRATON_DB, "SELECT * FROM events WHERE id = ?", [id]);
    return json(updated);
  } catch (e) {
    return handleDbError(e, env);
  }
}

async function deleteEvent(env: Env, id: number): Promise<Response> {
  try {
    const existing = await queryOne(env.STRATON_DB, "SELECT id FROM events WHERE id = ?", [id]);
    if (!existing) return error("Event not found", 404);
    await execute(env.STRATON_DB, "DELETE FROM events WHERE id = ?", [id]);
    return json({ success: true });
  } catch (e) {
    return handleDbError(e, env);
  }
}
