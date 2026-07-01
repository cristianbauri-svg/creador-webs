// CRUD de paquetes
import { json, error } from "../utils/response";
import { queryAll, queryOne, execute, handleDbError } from "../utils/d1";
import type { Env } from "../index";

export async function handlePackages(request: Request, env: Env, pathname: string): Promise<Response> {
  const method = request.method;

  const match = pathname.match(/^\/api\/packages\/(\d+)$/);
  if (match) {
    const id = parseInt(match[1], 10);
    if (method === "GET") return getPackage(env, id);
    if (method === "PUT") return updatePackage(request, env, id);
    if (method === "DELETE") return deletePackage(env, id);
    return error("Method not allowed", 405);
  }

  if (method === "GET") return listPackages(request, env);
  if (method === "POST") return createPackage(request, env);
  return error("Method not allowed", 405);
}

async function listPackages(request: Request, env: Env): Promise<Response> {
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

    const countResult = await queryOne(env.STRATON_DB, `SELECT COUNT(*) as total FROM packages ${whereClause}`, params);
    const total = (countResult?.total as number) || 0;

    const rows = await queryAll(env.STRATON_DB, `SELECT * FROM packages ${whereClause} ORDER BY sort_order ASC LIMIT ? OFFSET ?`, [...params, perPage, offset]);

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
    return handleDbError(e);
  }
}

async function getPackage(env: Env, id: number): Promise<Response> {
  try {
    const row = await queryOne(env.STRATON_DB, "SELECT * FROM packages WHERE id = ?", [id]);
    if (!row) return error("Package not found", 404);
    return json(row);
  } catch (e) {
    return handleDbError(e);
  }
}

async function createPackage(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (!body.name || typeof body.name !== "string") return error("name is required");

    const result = await execute(
      env.STRATON_DB,
      `INSERT INTO packages (name, description, price_range, includes_json, recommended_event_type, status, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [body.name, body.description || null, body.price_range || null, body.includes_json || null, body.recommended_event_type || null, body.status || "draft", body.sort_order || 0]
    );

    const inserted = await queryOne(env.STRATON_DB, "SELECT * FROM packages WHERE id = ?", [result.meta.last_row_id]);
    return json(inserted, 201);
  } catch (e) {
    return handleDbError(e);
  }
}

async function updatePackage(request: Request, env: Env, id: number): Promise<Response> {
  try {
    const existing = await queryOne(env.STRATON_DB, "SELECT id FROM packages WHERE id = ?", [id]);
    if (!existing) return error("Package not found", 404);

    const body = await request.json() as Record<string, unknown>;
    const sets: string[] = [];
    const params: unknown[] = [];
    const fields = ["name", "description", "price_range", "includes_json", "recommended_event_type", "status", "sort_order"];
    for (const field of fields) {
      if (body[field] !== undefined) {
        sets.push(`${field} = ?`);
        params.push(body[field]);
      }
    }
    if (sets.length === 0) return error("No fields to update", 400);
    params.push(id);
    await execute(env.STRATON_DB, `UPDATE packages SET ${sets.join(", ")} WHERE id = ?`, params);
    const updated = await queryOne(env.STRATON_DB, "SELECT * FROM packages WHERE id = ?", [id]);
    return json(updated);
  } catch (e) {
    return handleDbError(e);
  }
}

async function deletePackage(env: Env, id: number): Promise<Response> {
  try {
    const existing = await queryOne(env.STRATON_DB, "SELECT id FROM packages WHERE id = ?", [id]);
    if (!existing) return error("Package not found", 404);
    await execute(env.STRATON_DB, "DELETE FROM packages WHERE id = ?", [id]);
    return json({ success: true });
  } catch (e) {
    return handleDbError(e);
  }
}
