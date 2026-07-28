// CRUD de servicios
import { json, error } from "../utils/response";
import { queryAll, queryOne, execute, handleDbError } from "../utils/d1";
import type { Env } from "../index";

export async function handleServices(request: Request, env: Env, pathname: string): Promise<Response> {
  const method = request.method;

  const match = pathname.match(/^\/api\/services\/(\d+)$/);
  if (match) {
    const id = parseInt(match[1], 10);
    if (method === "GET") return getService(env, id);
    if (method === "PUT") return updateService(request, env, id);
    if (method === "DELETE") return deleteService(env, id);
    return error("Method not allowed", 405);
  }

  if (method === "GET") return listServices(request, env);
  if (method === "POST") return createService(request, env);
  return error("Method not allowed", 405);
}

async function listServices(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get("per_page") || "20")));
    const offset = (page - 1) * perPage;

    let whereClause = "WHERE 1=1";
    const params: unknown[] = [];
    if (status) {
      whereClause += " AND status = ?";
      params.push(status);
    }

    const countResult = await queryOne(env.STRATON_DB, `SELECT COUNT(*) as total FROM services ${whereClause}`, params);
    const total = (countResult?.total as number) || 0;

    const rows = await queryAll(env.STRATON_DB, `SELECT * FROM services ${whereClause} ORDER BY sort_order ASC, created_at DESC LIMIT ? OFFSET ?`, [...params, perPage, offset]);

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

async function getService(env: Env, id: number): Promise<Response> {
  try {
    const row = await queryOne(env.STRATON_DB, "SELECT * FROM services WHERE id = ?", [id]);
    if (!row) return error("Service not found", 404);
    return json(row);
  } catch (e) {
    return handleDbError(e, env);
  }
}

async function createService(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (!body.title || typeof body.title !== "string") return error("title is required");

    const result = await execute(
      env.STRATON_DB,
      `INSERT INTO services (title, description, icon, image_url, sort_order, status, features)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [body.title, body.description || null, body.icon || null, body.image_url || null, body.sort_order || 0, body.status || "draft", body.features || null]
    );

    const inserted = await queryOne(env.STRATON_DB, "SELECT * FROM services WHERE id = ?", [result.meta.last_row_id]);
    return json(inserted, 201);
  } catch (e) {
    return handleDbError(e, env);
  }
}

async function updateService(request: Request, env: Env, id: number): Promise<Response> {
  try {
    const existing = await queryOne(env.STRATON_DB, "SELECT id FROM services WHERE id = ?", [id]);
    if (!existing) return error("Service not found", 404);

    const body = await request.json() as Record<string, unknown>;
    const sets: string[] = [];
    const params: unknown[] = [];
    const fields = ["title", "description", "icon", "image_url", "sort_order", "status", "features"];
    for (const field of fields) {
      if (body[field] !== undefined) {
        sets.push(`${field} = ?`);
        params.push(body[field]);
      }
    }
    if (sets.length === 0) return error("No fields to update", 400);
    params.push(id);
    await execute(env.STRATON_DB, `UPDATE services SET ${sets.join(", ")} WHERE id = ?`, params);
    const updated = await queryOne(env.STRATON_DB, "SELECT * FROM services WHERE id = ?", [id]);
    return json(updated);
  } catch (e) {
    return handleDbError(e, env);
  }
}

async function deleteService(env: Env, id: number): Promise<Response> {
  try {
    const existing = await queryOne(env.STRATON_DB, "SELECT id FROM services WHERE id = ?", [id]);
    if (!existing) return error("Service not found", 404);
    await execute(env.STRATON_DB, "DELETE FROM services WHERE id = ?", [id]);
    return json({ success: true });
  } catch (e) {
    return handleDbError(e, env);
  }
}
