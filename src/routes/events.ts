// CRUD de eventos
import { json, error } from "../utils/response";
import { queryAll, queryOne, execute, handleDbError } from "../utils/d1";
import { deleteR2Object } from "../utils/r2";
import type { Env } from "../index";

export async function handleEvents(request: Request, env: Env, pathname: string): Promise<Response> {
  const method = request.method;

  const match = pathname.match(/^\/api\/events\/(\d+)$/);
  if (match) {
    const id = parseInt(match[1], 10);
    if (method === "GET") return getEvent(env, id);
    if (method === "PUT") return updateEvent(request, env, id);
    if (method === "DELETE") return deleteEvent(env, id);
    return error("Method not allowed", 405);
  }

  if (method === "GET") return listEvents(request, env);
  if (method === "POST") return createEvent(request, env);
  return error("Method not allowed", 405);
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

async function getEvent(env: Env, id: number): Promise<Response> {
  try {
    const row = await queryOne(env.STRATON_DB, "SELECT * FROM events WHERE id = ?", [id]);
    if (!row) return error("Event not found", 404);
    return json(row);
  } catch (e) {
    return handleDbError(e, env);
  }
}

async function createEvent(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (!body.title || typeof body.title !== "string") return error("title is required");
    // Validar tipos de campos opcionales
    if (body.gallery_json !== undefined && body.gallery_json !== null && typeof body.gallery_json !== "string") return error("gallery_json debe ser string JSON", 400);
    if (body.link !== undefined && body.link !== null && typeof body.link !== "string") return error("link debe ser texto", 400);

    const validTypes = ["corporativo", "social", "concierto"];
    if (body.event_type && !validTypes.includes(body.event_type as string)) {
      return error(`Invalid event_type. Must be one of: ${validTypes.join(", ")}`, 400);
    }

    const result = await execute(
      env.STRATON_DB,
      `INSERT INTO events (title, event_type, solution, result, before_media_url, after_media_url, gallery_json, status, link)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [body.title, body.event_type || null, body.solution || null, body.result || null, body.before_media_url || null, body.after_media_url || null, body.gallery_json || null, body.status || "draft", body.link || null]
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

    const body = await request.json() as Record<string, unknown>;
    const sets: string[] = [];
    const params: unknown[] = [];
    // Limpiar imágenes anteriores de R2 si se reemplazaron
    if (body.before_media_url !== undefined && existing.before_media_url && existing.before_media_url !== body.before_media_url) {
      deleteR2Object(existing.before_media_url as string, env);
    }
    if (body.after_media_url !== undefined && existing.after_media_url && existing.after_media_url !== body.after_media_url) {
      deleteR2Object(existing.after_media_url as string, env);
    }
    const fields = ["title", "event_type", "solution", "result", "before_media_url", "after_media_url", "gallery_json", "status", "link"];
    for (const field of fields) {
      if (body[field] !== undefined) {
        sets.push(`${field} = ?`);
        params.push(body[field]);
      }
    }
    if (sets.length === 0) return error("No fields to update", 400);
    params.push(id);
    await execute(env.STRATON_DB, `UPDATE events SET ${sets.join(", ")} WHERE id = ?`, params);
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
