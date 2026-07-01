// CRUD de páginas (contenido editable del sitio)
import { json, error } from "../utils/response";
import { queryAll, queryOne, execute, handleDbError } from "../utils/d1";
import type { Env } from "../index";

export async function handlePages(request: Request, env: Env, pathname: string): Promise<Response> {
  const method = request.method;

  // GET /api/pages/slug/:slug — búsqueda por slug público
  const slugMatch = pathname.match(/^\/api\/pages\/slug\/(.+)$/);
  if (slugMatch) {
    if (method === "GET") return getPageBySlug(env, slugMatch[1]);
    return error("Method not allowed", 405);
  }

  // GET/PUT/DELETE /api/pages/:id
  const idMatch = pathname.match(/^\/api\/pages\/(\d+)$/);
  if (idMatch) {
    const id = parseInt(idMatch[1], 10);
    if (method === "GET") return getPage(env, id);
    if (method === "PUT") return updatePage(request, env, id);
    if (method === "DELETE") return deletePage(env, id);
    return error("Method not allowed", 405);
  }

  if (method === "GET") return listPages(request, env);
  if (method === "POST") return createPage(request, env);
  return error("Method not allowed", 405);
}

async function listPages(request: Request, env: Env): Promise<Response> {
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

    const countResult = await queryOne(env.STRATON_DB, `SELECT COUNT(*) as total FROM pages ${whereClause}`, params);
    const total = (countResult?.total as number) || 0;

    const rows = await queryAll(env.STRATON_DB, `SELECT * FROM pages ${whereClause} ORDER BY id ASC LIMIT ? OFFSET ?`, [...params, perPage, offset]);

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

async function getPage(env: Env, id: number): Promise<Response> {
  try {
    const row = await queryOne(env.STRATON_DB, "SELECT * FROM pages WHERE id = ?", [id]);
    if (!row) return error("Page not found", 404);
    return json(row);
  } catch (e) {
    return handleDbError(e);
  }
}

async function getPageBySlug(env: Env, slug: string): Promise<Response> {
  try {
    const row = await queryOne(env.STRATON_DB, "SELECT * FROM pages WHERE slug = ?", [slug]);
    if (!row) return error("Page not found", 404);
    return json(row);
  } catch (e) {
    return handleDbError(e);
  }
}

async function createPage(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (!body.slug || typeof body.slug !== "string") return error("slug is required");

    const result = await execute(
      env.STRATON_DB,
      `INSERT INTO pages (slug, title, content_json, meta_title, meta_description, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [body.slug, body.title || null, body.content_json || null, body.meta_title || null, body.meta_description || null, body.status || "draft"]
    );

    const inserted = await queryOne(env.STRATON_DB, "SELECT * FROM pages WHERE id = ?", [result.meta.last_row_id]);
    return json(inserted, 201);
  } catch (e) {
    return handleDbError(e);
  }
}

async function updatePage(request: Request, env: Env, id: number): Promise<Response> {
  try {
    const existing = await queryOne(env.STRATON_DB, "SELECT id FROM pages WHERE id = ?", [id]);
    if (!existing) return error("Page not found", 404);

    const body = await request.json() as Record<string, unknown>;
    const sets: string[] = [];
    const params: unknown[] = [];
    const fields = ["slug", "title", "content_json", "meta_title", "meta_description", "status"];
    for (const field of fields) {
      if (body[field] !== undefined) {
        sets.push(`${field} = ?`);
        params.push(body[field]);
      }
    }
    sets.push("updated_at = CURRENT_TIMESTAMP");
    if (sets.length === 1) return error("No fields to update", 400);
    params.push(id);
    await execute(env.STRATON_DB, `UPDATE pages SET ${sets.join(", ")} WHERE id = ?`, params);
    const updated = await queryOne(env.STRATON_DB, "SELECT * FROM pages WHERE id = ?", [id]);
    return json(updated);
  } catch (e) {
    return handleDbError(e);
  }
}

async function deletePage(env: Env, id: number): Promise<Response> {
  try {
    const existing = await queryOne(env.STRATON_DB, "SELECT id FROM pages WHERE id = ?", [id]);
    if (!existing) return error("Page not found", 404);
    await execute(env.STRATON_DB, "DELETE FROM pages WHERE id = ?", [id]);
    return json({ success: true });
  } catch (e) {
    return handleDbError(e);
  }
}
