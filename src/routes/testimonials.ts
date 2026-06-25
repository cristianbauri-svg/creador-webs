// CRUD de testimonios
import { json, error } from "../utils/response";
import { queryAll, queryOne, execute, handleDbError } from "../utils/d1";
import type { Env } from "../index";

export async function handleTestimonials(request: Request, env: Env, pathname: string): Promise<Response> {
  const method = request.method;

  const match = pathname.match(/^\/api\/testimonials\/(\d+)$/);
  if (match) {
    const id = parseInt(match[1], 10);
    if (method === "GET") return getTestimonial(env, id);
    if (method === "PUT") return updateTestimonial(request, env, id);
    if (method === "DELETE") return deleteTestimonial(env, id);
    return error("Method not allowed", 405);
  }

  if (method === "GET") return listTestimonials(request, env);
  if (method === "POST") return createTestimonial(request, env);
  return error("Method not allowed", 405);
}

async function listTestimonials(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const visible = url.searchParams.get("visible");
    const status = url.searchParams.get("status");
    let sql = "SELECT * FROM testimonials WHERE 1=1";
    const params: unknown[] = [];
    if (visible !== null) {
      sql += " AND visible = ?";
      params.push(visible === "1" || visible === "true" ? 1 : 0);
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

async function getTestimonial(env: Env, id: number): Promise<Response> {
  try {
    const row = await queryOne(env.STRATON_DB, "SELECT * FROM testimonials WHERE id = ?", [id]);
    if (!row) return error("Testimonial not found", 404);
    return json(row);
  } catch (e) {
    return handleDbError(e);
  }
}

async function createTestimonial(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (!body.client_name || typeof body.client_name !== "string") return error("client_name is required");
    if (!body.quote || typeof body.quote !== "string") return error("quote is required");

    const result = await execute(
      env.STRATON_DB,
      `INSERT INTO testimonials (client_name, company, quote, event_id, avatar_url, visible, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [body.client_name, body.company || null, body.quote, body.event_id || null, body.avatar_url || null, body.visible ? 1 : 0, body.status || "draft"]
    );

    const inserted = await queryOne(env.STRATON_DB, "SELECT * FROM testimonials WHERE id = ?", [result.meta.last_row_id]);
    return json(inserted, 201);
  } catch (e) {
    return handleDbError(e);
  }
}

async function updateTestimonial(request: Request, env: Env, id: number): Promise<Response> {
  try {
    const existing = await queryOne(env.STRATON_DB, "SELECT id FROM testimonials WHERE id = ?", [id]);
    if (!existing) return error("Testimonial not found", 404);

    const body = await request.json() as Record<string, unknown>;
    const sets: string[] = [];
    const params: unknown[] = [];
    const fields = ["client_name", "company", "quote", "event_id", "avatar_url", "visible", "status"];
    for (const field of fields) {
      if (body[field] !== undefined) {
        sets.push(`${field} = ?`);
        params.push(field === "visible" ? (body[field] ? 1 : 0) : body[field]);
      }
    }
    if (sets.length === 0) return error("No fields to update", 400);
    params.push(id);
    await execute(env.STRATON_DB, `UPDATE testimonials SET ${sets.join(", ")} WHERE id = ?`, params);
    const updated = await queryOne(env.STRATON_DB, "SELECT * FROM testimonials WHERE id = ?", [id]);
    return json(updated);
  } catch (e) {
    return handleDbError(e);
  }
}

async function deleteTestimonial(env: Env, id: number): Promise<Response> {
  try {
    const existing = await queryOne(env.STRATON_DB, "SELECT id FROM testimonials WHERE id = ?", [id]);
    if (!existing) return error("Testimonial not found", 404);
    await execute(env.STRATON_DB, "DELETE FROM testimonials WHERE id = ?", [id]);
    return json({ success: true });
  } catch (e) {
    return handleDbError(e);
  }
}
