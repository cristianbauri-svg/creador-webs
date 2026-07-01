// CRUD de productos
import { json, error } from "../utils/response";
import { queryAll, queryOne, execute, handleDbError } from "../utils/d1";
import type { Env } from "../index";

export async function handleProducts(request: Request, env: Env, pathname: string): Promise<Response> {
  const url = new URL(request.url);
  const method = request.method;

  // GET /api/products/:id
  const match = pathname.match(/^\/api\/products\/(\d+)$/);
  if (match) {
    const id = parseInt(match[1], 10);
    if (method === "GET") return getProduct(env, id);
    if (method === "PUT") return updateProduct(request, env, id);
    if (method === "DELETE") return deleteProduct(env, id);
    return error("Method not allowed", 405);
  }

  // /api/products (colección)
  if (method === "GET") return listProducts(request, env);
  if (method === "POST") return createProduct(request, env);
  return error("Method not allowed", 405);
}

async function listProducts(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const category = url.searchParams.get("category");
    const status = url.searchParams.get("status");
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get("per_page") || "20")));
    const offset = (page - 1) * perPage;

    let whereClause = "WHERE 1=1";
    const params: unknown[] = [];

    if (category) {
      whereClause += " AND category = ?";
      params.push(category);
    }
    if (status) {
      whereClause += " AND status = ?";
      params.push(status);
    }

    const countResult = await queryOne(env.STRATON_DB, `SELECT COUNT(*) as total FROM products ${whereClause}`, params);
    const total = (countResult?.total as number) || 0;

    const rows = await queryAll(env.STRATON_DB, `SELECT * FROM products ${whereClause} ORDER BY sort_order ASC, created_at DESC LIMIT ? OFFSET ?`, [...params, perPage, offset]);

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

async function getProduct(env: Env, id: number): Promise<Response> {
  try {
    const row = await queryOne(env.STRATON_DB, "SELECT * FROM products WHERE id = ?", [id]);
    if (!row) return error("Product not found", 404);
    return json(row);
  } catch (e) {
    return handleDbError(e);
  }
}

async function createProduct(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (!body.title || typeof body.title !== "string") {
      return error("title is required");
    }

    const result = await execute(
      env.STRATON_DB,
      `INSERT INTO products (title, category, service_type, description, features, image_url, gallery_json, active, status, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        body.title,
        body.category || "Audio",
        body.service_type || "Venta",
        body.description || null,
        body.features || null,
        body.image_url || null,
        body.gallery_json || null,
        body.active !== undefined ? (body.active ? 1 : 0) : 1,
        body.status || "draft",
        body.sort_order || 0,
      ]
    );

    const inserted = await queryOne(env.STRATON_DB, "SELECT * FROM products WHERE id = ?", [result.meta.last_row_id]);
    return json(inserted, 201);
  } catch (e) {
    return handleDbError(e);
  }
}

async function updateProduct(request: Request, env: Env, id: number): Promise<Response> {
  try {
    const existing = await queryOne(env.STRATON_DB, "SELECT id FROM products WHERE id = ?", [id]);
    if (!existing) return error("Product not found", 404);

    const body = await request.json() as Record<string, unknown>;
    const sets: string[] = [];
    const params: unknown[] = [];

    const fields = ["title", "category", "service_type", "description", "features", "image_url", "gallery_json", "active", "status", "sort_order"];
    for (const field of fields) {
      if (body[field] !== undefined) {
        sets.push(`${field} = ?`);
        params.push(body[field]);
      }
    }

    if (sets.length === 0) return error("No fields to update", 400);

    params.push(id);
    await execute(env.STRATON_DB, `UPDATE products SET ${sets.join(", ")} WHERE id = ?`, params);

    const updated = await queryOne(env.STRATON_DB, "SELECT * FROM products WHERE id = ?", [id]);
    return json(updated);
  } catch (e) {
    return handleDbError(e);
  }
}

async function deleteProduct(env: Env, id: number): Promise<Response> {
  try {
    const existing = await queryOne(env.STRATON_DB, "SELECT id FROM products WHERE id = ?", [id]);
    if (!existing) return error("Product not found", 404);

    await execute(env.STRATON_DB, "DELETE FROM products WHERE id = ?", [id]);
    return json({ success: true });
  } catch (e) {
    return handleDbError(e);
  }
}
