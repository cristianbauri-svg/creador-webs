// CRUD de eventos
import { json, error } from "../utils/response";
import { queryAll, queryOne, execute, handleDbError } from "../utils/d1";
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
    let sql = "SELECT * FROM events WHERE 1=1";
    const params: unknown[] = [];
    if (eventType) {
      sql += " AND event_type = ?";
      params.push(eventType);
    }
    if (status) {
      sql += " AND status = ?";
      params.push(status);
    }
    sql += " ORDER BY created_at DESC";
    const rows = await queryAll(env.STRATON_DB, sql, params);
    return json(rows);
  } catch (e) {
    return handleDbError(e);
  }
}

async function getEvent(env: Env, id: number): Promise<Response> {
  try {
    const row = await queryOne(env.STRATON_DB, "SELECT * FROM events WHERE id = ?", [id]);
    if (!row) return error("Event not found", 404);
    return json(row);
  } catch (e) {
    return handleDbError(e);
  }
}

async function createEvent(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (!body.title || typeof body.title !== "string") return error("title is required");

    const validTypes = ["corporativo", "social", "concierto"];
    if (body.event_type && !validTypes.includes(body.event_type as string)) {
      return error(`Invalid event_type. Must be one of: ${validTypes.join(", ")}`, 400);
    }

    const result = await execute(
      env.STRATON_DB,
      `INSERT INTO events (title, event_type, solution, result, before_media_url, after_media_url, gallery_json, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [body.title, body.event_type || null, body.solution || null, body.result || null, body.before_media_url || null, body.after_media_url || null, body.gallery_json || null, body.status || "draft"]
    );

    const inserted = await queryOne(env.STRATON_DB, "SELECT * FROM events WHERE id = ?", [result.meta.last_row_id]);
    return json(inserted, 201);
  } catch (e) {
    return handleDbError(e);
  }
}

async function updateEvent(request: Request, env: Env, id: number): Promise<Response> {
  try {
    const existing = await queryOne(env.STRATON_DB, "SELECT id FROM events WHERE id = ?", [id]);
    if (!existing) return error("Event not found", 404);

    const body = await request.json() as Record<string, unknown>;
    const sets: string[] = [];
    const params: unknown[] = [];
    const fields = ["title", "event_type", "solution", "result", "before_media_url", "after_media_url", "gallery_json", "status"];
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
    return handleDbError(e);
  }
}

async function deleteEvent(env: Env, id: number): Promise<Response> {
  try {
    const existing = await queryOne(env.STRATON_DB, "SELECT id FROM events WHERE id = ?", [id]);
    if (!existing) return error("Event not found", 404);
    await execute(env.STRATON_DB, "DELETE FROM events WHERE id = ?", [id]);
    return json({ success: true });
  } catch (e) {
    return handleDbError(e);
  }
}
