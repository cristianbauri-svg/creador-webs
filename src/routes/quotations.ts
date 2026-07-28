// CRUD de cotizaciones
// POST /api/quotations es público (sin auth)
// PUT /api/quotations/:id solo actualiza status
import { json, error } from "../utils/response";
import { queryAll, queryOne, execute, handleDbError } from "../utils/d1";
import type { Env } from "../index";

export async function handleQuotations(request: Request, env: Env, pathname: string): Promise<Response> {
  const method = request.method;

  // Rate limiting: máximo 5 cotizaciones por hora por IP
  if (method === "POST") {
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const rateKey = `ratelimit:quotation:${ip}`;
    const currentCount = parseInt(await env.STRATON_KV.get(rateKey) || "0");

    if (currentCount >= 5) {
      return error("Demasiadas solicitudes. Intenta de nuevo en una hora.", 429);
    }

    await env.STRATON_KV.put(rateKey, String(currentCount + 1), { expirationTtl: 3600 });
  }

  // GET /api/quotations/:id
  const match = pathname.match(/^\/api\/quotations\/(\d+)$/);
  if (match) {
    const id = parseInt(match[1], 10);
    if (method === "GET") return getQuotation(env, id);
    if (method === "PUT") return updateQuotationStatus(request, env, id);
    return error("Method not allowed", 405);
  }

  if (method === "GET") return listQuotations(request, env);
  if (method === "POST") return createQuotation(request, env);
  return error("Method not allowed", 405);
}

async function listQuotations(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"));
    const perPage = Math.min(100, Math.max(1, parseInt(url.searchParams.get("per_page") || "20")));
    const offset = (page - 1) * perPage;

    const countResult = await queryOne(env.STRATON_DB, "SELECT COUNT(*) as total FROM quotations");
    const total = (countResult?.total as number) || 0;

    const rows = await queryAll(env.STRATON_DB, "SELECT * FROM quotations ORDER BY created_at DESC LIMIT ? OFFSET ?", [perPage, offset]);

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

async function getQuotation(env: Env, id: number): Promise<Response> {
  try {
    const row = await queryOne(env.STRATON_DB, "SELECT * FROM quotations WHERE id = ?", [id]);
    if (!row) return error("Quotation not found", 404);
    return json(row);
  } catch (e) {
    return handleDbError(e, env);
  }
}

async function createQuotation(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as Record<string, unknown>;

    // Validar formato de email
    if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
      return error("Formato de email inválido", 400);
    }

    // Validar formato de teléfono (mínimo 7 dígitos, permite +, espacios, guiones)
    if (body.phone && body.phone.replace(/[^0-9]/g, '').length < 7) {
      return error("El teléfono debe tener al menos 7 dígitos", 400);
    }

    // Validar formato de fecha ISO 8601 (YYYY-MM-DD)
    if (body.event_date && !/^\d{4}-\d{2}-\d{2}$/.test(body.event_date)) {
      return error("Formato de fecha inválido. Use YYYY-MM-DD.", 400);
    }

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

    // Notificar por Telegram (no bloquea la respuesta si falla)
    await sendTelegramNotification(inserted, env);

    return json(inserted, 201);
  } catch (e) {
    return handleDbError(e, env);
  }
}

async function sendTelegramNotification(quotation: Record<string, unknown>, env: Env): Promise<void> {
  try {
    const token = env.TELEGRAM_BOT_TOKEN;
    const rawChatIds = env.TELEGRAM_CHAT_ID;
    if (!token || !rawChatIds) return;

    // Dividir por comas, limpiar espacios y filtrar vacíos
    const chatIds = rawChatIds
      .split(',')
      .map((id: string) => id.trim())
      .filter((id: string) => id.length > 0);

    if (chatIds.length === 0) return;

    // Escapar caracteres reservados de Markdown
    const esc = (str: string) => str.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');

    const name = esc(String(quotation.customer_name || '—'));
    const email = esc(String(quotation.email || '—'));
    const phone = esc(String(quotation.phone || '—'));
    const eventDate = esc(String(quotation.event_date || '—'));
    const company = esc(String(quotation.company || '—'));
    const city = esc(String(quotation.city || '—'));
    const notes = esc(String(quotation.notes || '—'));

    // Productos solicitados
    let productsText = '_No se especificaron productos._';
    try {
      const productsJson = typeof quotation.products_json === 'string'
        ? JSON.parse(quotation.products_json)
        : quotation.products_json;
      if (Array.isArray(productsJson) && productsJson.length > 0) {
        productsText = productsJson.map((p: Record<string, unknown>) => {
          const pName = esc(String(p.name || p.product_name || '—'));
          const qty = p.quantity || p.qty || 1;
          return `• ${pName} ×${qty}`;
        }).join('\n');
      }
    } catch { /* ignorar errores de parseo */ }

    const message =
      '📩 *Nueva cotización recibida*\n' +
      `👤 *Cliente:* ${name}\n` +
      `📧 *Email:* ${email}\n` +
      `📱 *Teléfono:* ${phone}\n` +
      `📅 *Fecha del evento:* ${eventDate}\n` +
      `🏢 *Empresa:* ${company}\n` +
      `📍 *Ciudad:* ${city}\n` +
      `📦 *Productos solicitados:*\n${productsText}\n` +
      `💬 *Comentarios:* ${notes}`;

    // Enviar a cada chat ID de forma independiente
    for (const chatId of chatIds) {
      try {
        const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: message,
            parse_mode: 'Markdown',
          }),
        });

        if (!response.ok) {
          console.error(`Telegram notification failed for chat ID ${chatId}`);
        }
      } catch (err) {
        console.error(`Telegram notification error for chat ID ${chatId}:`, err);
      }
    }
  } catch (err) {
    console.error('Telegram notification error:', err);
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
    return handleDbError(e, env);
  }
}
