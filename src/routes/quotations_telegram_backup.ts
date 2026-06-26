// CRUD de cotizaciones
// POST /api/quotations es público (sin auth)
// PUT /api/quotations/:id solo actualiza status
import { json, error } from "../utils/response";
import { queryAll, queryOne, execute, handleDbError } from "../utils/d1";
import type { Env } from "../index";

export async function handleQuotations(request: Request, env: Env, pathname: string): Promise<Response> {
  const method = request.method;

  // GET /api/quotations/:id
  const match = pathname.match(/^\/api\/quotations\/(\d+)$/);
  if (match) {
    const id = parseInt(match[1], 10);
    if (method === "GET") return getQuotation(env, id);
    if (method === "PUT") return updateQuotationStatus(request, env, id);
    return error("Method not allowed", 405);
  }

  if (method === "GET") return listQuotations(env);
  if (method === "POST") return createQuotation(request, env);
  return error("Method not allowed", 405);
}

async function listQuotations(env: Env): Promise<Response> {
  try {
    const rows = await queryAll(env.STRATON_DB, "SELECT * FROM quotations ORDER BY created_at DESC");
    return json(rows);
  } catch (e) {
    return handleDbError(e);
  }
}

async function getQuotation(env: Env, id: number): Promise<Response> {
  try {
    const row = await queryOne(env.STRATON_DB, "SELECT * FROM quotations WHERE id = ?", [id]);
    if (!row) return error("Quotation not found", 404);
    return json(row);
  } catch (e) {
    return handleDbError(e);
  }
}

async function createQuotation(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as Record<string, unknown>;

    const result = await execute(
      env.STRATON_DB,
      `INSERT INTO quotations (customer_name, email, phone, company, city, event_date, notes, products_json, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        body.customer_name || null,
        body.email || null,
        body.phone || null,
        body.company || null,
        body.city || null,
        body.event_date || null,
        body.notes || null,
        body.products_json || null,
      ]
    );

    const inserted = await queryOne(env.STRATON_DB, "SELECT * FROM quotations WHERE id = ?", [result.meta.last_row_id]);
    return json(inserted, 201);
  } catch (e) {
    return handleDbError(e);
  }
}

async function updateQuotationStatus(request: Request, env: Env, id: number): Promise<Response> {
  try {
    const existing = await queryOne(env.STRATON_DB, "SELECT id FROM quotations WHERE id = ?", [id]);
    if (!existing) return error("Quotation not found", 404);

    const body = await request.json() as Record<string, unknown>;
    if (!body.status || typeof body.status !== "string") {
      return error("status is required");
    }

    const validStatuses = ["pending", "contacted", "quoted", "closed"];
    if (!validStatuses.includes(body.status)) {
      return error(`Invalid status. Must be one of: ${validStatuses.join(", ")}`, 400);
    }

    await execute(env.STRATON_DB, "UPDATE quotations SET status = ? WHERE id = ?", [body.status, id]);

    const updated = await queryOne(env.STRATON_DB, "SELECT * FROM quotations WHERE id = ?", [id]);
    return json(updated);
  } catch (e) {
    return handleDbError(e);
  }
}
