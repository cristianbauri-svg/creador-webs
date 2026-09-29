// CRUD de cotizaciones
// POST /api/quotations es público (sin auth) y valida el lead (validateLead)
// PUT /api/quotations/:id solo actualiza status
import { json, error } from "../utils/response";
import { queryAll, queryOne, execute, handleDbError } from "../utils/d1";
import type { Env } from "../index";

// -----------------------------------------------------------------------------
// Validación del formulario público
// -----------------------------------------------------------------------------
// Es la validación autoritativa. StratonLead.validate() en public/js/app.js
// replica estas reglas solo para avisar antes de enviar: si cambias una, cambia
// la otra.

const LEAD_FIELDS = ["customer_name", "email", "phone", "company", "city", "event_date", "notes"] as const;
type LeadField = (typeof LEAD_FIELDS)[number];

/** Campos obligatorios de cada formulario del sitio: los que cada uno ya marca
 *  como obligatorios. Cada formulario envía su form_id. */
const LEAD_FORMS: Record<string, readonly LeadField[]> = {
  quote_form: ["customer_name", "email", "phone"], // #quotationForm, sección #contacto de la home
  contact_form: ["customer_name", "email", "notes"], // bloque contact-form de las páginas dinámicas
  cart_whatsapp_form: ["customer_name", "phone"], // modal del carrito que abre WhatsApp
};

/** Sin form_id (p. ej., una pestaña abierta con el app.js anterior) se aplican
 *  las reglas del formulario principal. */
const DEFAULT_LEAD_FORM = "quote_form";

const LEAD_LABELS: Record<LeadField, string> = {
  customer_name: "el nombre",
  email: "el correo electrónico",
  phone: "el teléfono",
  company: "la empresa",
  city: "la ciudad",
  event_date: "la fecha del evento",
  notes: "el mensaje",
};

const LEAD_MAX_LENGTH: Record<LeadField, number> = {
  customer_name: 120,
  email: 254,
  phone: 30,
  company: 150,
  city: 100,
  event_date: 10,
  notes: 5000,
};

/** Formato de los campos que lo tienen: [prueba, mensaje si falla]. */
const LEAD_FORMAT: Partial<Record<LeadField, [test: (value: string) => boolean, message: string]>> = {
  email: [(v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "El correo electrónico no es válido."],
  // Sin separadores visuales (espacios, guiones, paréntesis, puntos): + opcional
  // y de 7 a 15 dígitos, el máximo de E.164.
  phone: [(v) => /^\+?\d{7,15}$/.test(v.replace(/[\s().-]/g, "")), "El teléfono no es válido: usa entre 7 y 15 dígitos."],
  event_date: [(v) => /^\d{4}-\d{2}-\d{2}$/.test(v), "La fecha del evento no es válida. Usa el formato AAAA-MM-DD."],
};

type Lead = Record<LeadField, string | null> & { products_json: string | null };
type LeadValidation = { ok: true; lead: Lead } | { ok: false; field: string; message: string };

/** Valida el cuerpo de POST /api/quotations según su form_id. Devuelve el
 *  primer problema o los valores, ya recortados, que se guardan. */
function validateLead(body: Record<string, unknown>): LeadValidation {
  const formId = body.form_id ?? DEFAULT_LEAD_FORM;
  if (typeof formId !== "string" || !Object.hasOwn(LEAD_FORMS, formId)) {
    return { ok: false, field: "form_id", message: "Formulario desconocido." };
  }
  const required = LEAD_FORMS[formId];

  const lead = { products_json: null } as Lead;
  for (const field of LEAD_FIELDS) {
    const raw = body[field];
    if (raw !== undefined && raw !== null && typeof raw !== "string") {
      return { ok: false, field, message: `El campo ${field} debe ser texto.` };
    }
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value) {
      if (required.includes(field)) return { ok: false, field, message: `Completa ${LEAD_LABELS[field]}.` };
      lead[field] = null;
      continue;
    }
    if (value.length > LEAD_MAX_LENGTH[field]) {
      return { ok: false, field, message: `Máximo ${LEAD_MAX_LENGTH[field]} caracteres en ${LEAD_LABELS[field]}.` };
    }
    const format = LEAD_FORMAT[field];
    if (format && !format[0](value)) return { ok: false, field, message: format[1] };
    lead[field] = value;
  }

  const products = body.products_json;
  if (products !== undefined && products !== null && typeof products !== "string") {
    return { ok: false, field: "products_json", message: "products_json debe ser string JSON" };
  }
  lead.products_json = typeof products === "string" && products !== "" ? products : null;

  return { ok: true, lead };
}

export async function handleQuotations(request: Request, env: Env, pathname: string, ctx: ExecutionContext): Promise<Response> {
  const method = request.method;

  // GET /api/quotations/:id
  const match = pathname.match(/^\/api\/quotations\/(\d+)$/);
  if (match) {
    const id = parseInt(match[1], 10);
    if (method === "GET") return getQuotation(env, id);
    if (method === "PUT") return updateQuotationStatus(request, env, id);
    return error("Method not allowed", 405);
  }

  if (method === "GET") return listQuotations(request, env);
  if (method === "POST") return createQuotation(request, env, ctx);
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

async function createQuotation(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  // Un cuerpo que no es JSON (p. ej., el envío nativo del formulario sin
  // JavaScript) es un error del cliente, no de la base de datos.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error("Solicitud inválida: se esperaba JSON.", 400);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return error("Solicitud inválida: se esperaba un objeto JSON.", 400);
  }

  // Nada se guarda ni se notifica si falta un campo obligatorio o uno es inválido.
  const validation = validateLead(body as Record<string, unknown>);
  if (!validation.ok) {
    return json({ error: validation.message, field: validation.field }, 400);
  }
  const { lead } = validation;

  try {
    // Rate limiting: máximo 5 cotizaciones por hora por IP.
    // La validación del body ocurre ANTES de incrementar el contador,
    // así un body inválido no consume cuota.
    // NOTA: read-then-write en KV no es atómico — dos requests concurrentes
    // de la misma IP pueden leer el mismo currentCount y ambos pasar.
    // Un fix completo requeriría Durable Objects, pero el impacto es
    // limitado (máximo ~2x el límite en ráfagas muy cortas).
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const rateKey = `ratelimit:quotation:${ip}`;
    const currentCount = parseInt(await env.STRATON_KV.get(rateKey) || "0");

    if (currentCount >= 5) {
      return error("Demasiadas solicitudes. Intenta de nuevo en una hora.", 429);
    }

    // Escribir el nuevo contador en segundo plano para no bloquear la respuesta
    const newCount = currentCount + 1;
    ctx.waitUntil(env.STRATON_KV.put(rateKey, String(newCount), { expirationTtl: 3600 }));

    const result = await execute(
      env.STRATON_DB,
      `INSERT INTO quotations (customer_name, email, phone, company, city, event_date, notes, products_json, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        lead.customer_name,
        lead.email,
        lead.phone,
        lead.company,
        lead.city,
        lead.event_date,
        lead.notes,
        lead.products_json,
      ]
    );

    const inserted = await queryOne(env.STRATON_DB, "SELECT * FROM quotations WHERE id = ?", [result.meta.last_row_id]);

    // M12: no bloquear la respuesta — enviar la notificación de Telegram en segundo plano
    ctx.waitUntil(sendTelegramNotification(inserted as Record<string, unknown>, env));

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
