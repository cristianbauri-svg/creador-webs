// Regresión del hotfix de seguridad de la API (2026-09-24).
//
// La autenticación se prueba de punta a punta: cada prueba firma un JWT RS256
// real con una clave generada aquí y publica la clave pública en la caché de
// KV que lee getJwks(), así que validateAccess() verifica firma, aud y
// vencimiento sin salir a la red. Las peticiones van a un host real
// (stratonaudio.com.co): el bypass de localhost de wrangler dev no aplica.
//
// D1, KV y R2 son los emulados y efímeros de @cloudflare/vitest-plugin.
// Ninguna prueba toca producción ni la base local de `wrangler dev`.

import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import worker, { type Env } from "../src";
import { mediaKeyFromUrl } from "../src/utils/r2";
import { resetTables } from "./fixtures/d1-schema";
import eventsPanelHtml from "../public/admin/modules/events.html?raw";

const ORIGIN = "https://stratonaudio.com.co";
const TEST_AUD = "aud-de-prueba";
const KID = "kid-de-prueba";

let signingKey: CryptoKey;
let foreignKey: CryptoKey; // clave privada que Access no conoce
let publicJwk: JsonWebKey;

const RSA = {
  name: "RSASSA-PKCS1-v1_5",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
};

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey(RSA, true, ["sign", "verify"])) as CryptoKeyPair;
  signingKey = pair.privateKey;
  publicJwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
  const other = (await crypto.subtle.generateKey(RSA, true, ["sign", "verify"])) as CryptoKeyPair;
  foreignKey = other.privateKey;
});

beforeEach(async () => {
  await resetTables(env.STRATON_DB);
  // getJwks() lee primero esta caché: la verificación es real y no sale a la red.
  await env.STRATON_KV.put(
    "cf_access_jwks_cache",
    JSON.stringify({ keys: [{ kid: KID, kty: publicJwk.kty, n: publicJwk.n, e: publicJwk.e }] })
  );
});

// -----------------------------------------------------------------------------
// Utilidades
// -----------------------------------------------------------------------------

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const encodePart = (value: unknown) => base64Url(new TextEncoder().encode(JSON.stringify(value)));

/** JWT de Cloudflare Access firmado con `key`. Por defecto, válido. */
async function accessJwt(claims: Record<string, unknown> = {}, key: CryptoKey = signingKey): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = encodePart({ alg: "RS256", kid: KID, typ: "JWT" });
  const payload = encodePart({
    aud: [TEST_AUD],
    email: "admin@stratonaudio.test",
    iat: now,
    nbf: now - 5,
    exp: now + 300,
    ...claims,
  });
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${base64Url(new Uint8Array(signature))}`;
}

function testEnv(overrides: Partial<Env> = {}): Env {
  return {
    ...(env as unknown as Env),
    CF_ACCESS_AUD: TEST_AUD,
    CF_ACCESS_TEAM_DOMAIN: "equipo-de-prueba",
    // Sin credenciales de Telegram: el POST público de cotizaciones no envía
    // notificaciones reales durante las pruebas.
    TELEGRAM_BOT_TOKEN: "",
    TELEGRAM_CHAT_ID: "",
    ...overrides,
  };
}

/** D1 trampa: si un handler llega a consultarla, la prueba lo detecta. */
function trapDb() {
  const state = { touched: false };
  const db = {
    prepare() {
      state.touched = true;
      throw new Error("D1 no debía consultarse");
    },
  } as unknown as D1Database;
  return { db, state };
}

/** Cubo de R2 que solo registra qué claves se piden borrar. */
function recordingBucket() {
  const deleted: string[] = [];
  const bucket = {
    delete: async (key: string) => {
      deleted.push(key);
    },
  } as unknown as R2Bucket;
  return { bucket, deleted };
}

async function call(
  method: string,
  path: string,
  opts: { body?: unknown; token?: string; env?: Env } = {}
): Promise<Response> {
  const headers = new Headers({ Accept: "application/json" });
  let body: string | undefined;
  if (opts.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
  }
  if (opts.token) headers.set("Cf-Access-Jwt-Assertion", opts.token);
  const request = new Request(ORIGIN + path, { method, headers, body });
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, opts.env ?? testEnv(), ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

async function insertRow(table: string, row: Record<string, unknown>): Promise<void> {
  const cols = Object.keys(row);
  await env.STRATON_DB.prepare(`INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map(() => "?").join(", ")})`)
    .bind(...Object.values(row))
    .run();
}

const eventRow = (id: number) => env.STRATON_DB.prepare("SELECT * FROM events WHERE id = ?").bind(id).first();
const eventCount = () => env.STRATON_DB.prepare("SELECT COUNT(*) AS n FROM events").first<number>("n");

// Imágenes con el formato que devuelve /api/upload.
const PRODUCT_IMG = "/api/media/products/76586a03-8127-4918-8747-7a3f15e519e9.webp";
const EVENT_IMG_OLD = "/api/media/events/1edf0c65-2704-4992-b574-689ae5ea8024.webp";
const EVENT_IMG_NEW = "/api/media/events/6a02749a-c41a-4d39-b575-57ef3f1dbf51.webp";

// -----------------------------------------------------------------------------
// Fase 1 — /api/events: toda escritura exige sesión
// -----------------------------------------------------------------------------

describe("Fase 1 — escribir en /api/events exige sesión de Access", () => {
  const writes: Array<[method: string, path: string, body?: unknown]> = [
    ["POST", "/api/events", { title: "Evento", status: "published" }],
    ["PUT", "/api/events/1", { title: "Cambiado" }],
    ["PATCH", "/api/events/1", { title: "Cambiado" }],
    ["DELETE", "/api/events/1"],
  ];

  for (const [method, path, body] of writes) {
    it(`${method} ${path} sin sesión → 401 antes de consultar D1`, async () => {
      const { db, state } = trapDb();
      const res = await call(method, path, { body, env: testEnv({ STRATON_DB: db }) });
      expect(res.status).toBe(401);
      expect(state.touched).toBe(false);
    });
  }

  it("una ruta de escritura nueva nace protegida (regla cerrada por defecto)", async () => {
    const { db, state } = trapDb();
    const res = await call("POST", "/api/ruta-que-no-existe", { body: {}, env: testEnv({ STRATON_DB: db }) });
    expect(res.status).toBe(401);
    expect(state.touched).toBe(false);
  });

  it("JWT firmado con otra clave, con otro aud, vencido o malformado → 401", async () => {
    const { db, state } = trapDb();
    const now = Math.floor(Date.now() / 1000);
    const tokens = [
      await accessJwt({}, foreignKey),
      await accessJwt({ aud: ["otra-aplicacion"] }),
      await accessJwt({ exp: now - 60 }),
      "no-es-un-jwt",
    ];
    for (const token of tokens) {
      const res = await call("POST", "/api/events", { token, body: { title: "x" }, env: testEnv({ STRATON_DB: db }) });
      expect(res.status).toBe(401);
    }
    expect(state.touched).toBe(false);
  });

  it("con sesión válida el ciclo crear → editar → borrar sigue funcionando", async () => {
    const token = await accessJwt();
    const created = await call("POST", "/api/events", {
      token,
      body: {
        title: "Lanzamiento",
        event_type: "corporativo",
        status: "published",
        solution: "Line array y monitores",
        result: "Cliente satisfecho",
        link: "https://canva.link/0dm01v7opb86bps",
        gallery_json: JSON.stringify([PRODUCT_IMG]),
      },
    });
    expect(created.status).toBe(201);
    const ev = (await created.json()) as Record<string, unknown>;
    expect(ev).toMatchObject({ title: "Lanzamiento", event_type: "corporativo", status: "published" });

    const updated = await call("PUT", `/api/events/${ev.id}`, { token, body: { title: "Lanzamiento 2026", status: "draft" } });
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ title: "Lanzamiento 2026", status: "draft", event_type: "corporativo" });

    const removed = await call("DELETE", `/api/events/${ev.id}`, { token });
    expect(removed.status).toBe(200);
    expect(await eventRow(ev.id as number)).toBeNull();
  });

  it("el cuerpo exacto que envía hoy el panel se acepta al crear y al editar", async () => {
    // El panel sube antes, después y galería con uploadFile(), la única llamada
    // a /api/upload, y esa función pide la carpeta events/ (nunca products/).
    expect(eventsPanelHtml).toMatch(/formData\.append\(\s*['"]folder['"]\s*,\s*['"]events['"]\s*\)/);
    expect(eventsPanelHtml).not.toMatch(/['"]?folder['"]?\s*[,:=]\s*['"]products['"]/);
    expect(eventsPanelHtml.match(/\/api\/upload/g)).toHaveLength(1);

    const token = await accessJwt();
    // Mismo objeto que arma saveEvent() en public/admin/modules/events.html.
    const panelBody = {
      title: "Evento Neodent",
      event_type: "corporativo",
      solution: null,
      result: null,
      before_media_url: null,
      after_media_url: null,
      gallery_json: JSON.stringify([EVENT_IMG_NEW]),
      link: null,
      status: "draft",
    };
    const created = await call("POST", "/api/events", { token, body: panelBody });
    expect(created.status).toBe(201);
    const { id } = (await created.json()) as { id: number };
    const edited = await call("PUT", `/api/events/${id}`, { token, body: { ...panelBody, status: "published" } });
    expect(edited.status).toBe(200);
    expect(await eventRow(id)).toMatchObject({ ...panelBody, status: "published" });
  });
});

// -----------------------------------------------------------------------------
// Fase 2 — /api/quotations
// -----------------------------------------------------------------------------

describe("Fase 2 — cotizaciones", () => {
  it("PUT /api/quotations/:id sin sesión → 401 antes de consultar D1", async () => {
    const { db, state } = trapDb();
    const res = await call("PUT", "/api/quotations/1", { body: { status: "closed" }, env: testEnv({ STRATON_DB: db }) });
    expect(res.status).toBe(401);
    expect(state.touched).toBe(false);
  });

  it("leer cotizaciones sigue exigiendo sesión (GET, HEAD, por id)", async () => {
    const { db, state } = trapDb();
    for (const [method, path] of [["GET", "/api/quotations"], ["GET", "/api/quotations/1"], ["HEAD", "/api/quotations"]]) {
      const res = await call(method, path, { env: testEnv({ STRATON_DB: db }) });
      expect(res.status).toBe(401);
    }
    expect(state.touched).toBe(false);
  });

  it("con sesión el panel sigue cambiando el estado", async () => {
    await insertRow("quotations", { id: 1, customer_name: "Cliente de prueba", status: "pending" });
    const res = await call("PUT", "/api/quotations/1", { token: await accessJwt(), body: { status: "contacted" } });
    expect(res.status).toBe(200);
    expect(await env.STRATON_DB.prepare("SELECT status FROM quotations WHERE id = 1").first("status")).toBe("contacted");
  });

  it("el formulario público sigue creando cotizaciones sin sesión", async () => {
    const res = await call("POST", "/api/quotations", {
      body: { customer_name: "Prueba", email: "prueba@example.com", phone: "3000000000", city: "Bogotá" },
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ customer_name: "Prueba", status: "pending" });
  });
});

// -----------------------------------------------------------------------------
// Fase 3 — validación compartida entre crear y actualizar
// -----------------------------------------------------------------------------

describe("Fase 3 — crear y actualizar un evento validan igual", () => {
  const INVALID: Array<[name: string, patch: Record<string, unknown>]> = [
    ["event_type con HTML", { event_type: "<img src=x onerror=alert(1)>" }],
    ["event_type desconocido", { event_type: "boda" }],
    ["status desconocido", { status: "archived" }],
    ["título vacío", { title: "   " }],
    ["título de más de 200 caracteres", { title: "x".repeat(201) }],
    ["título que no es texto", { title: 123 }],
    ["solution que no es texto", { solution: { html: "<b>x</b>" } }],
    ["result de más de 5000 caracteres", { result: "x".repeat(5001) }],
    ["link javascript:", { link: "javascript:alert(1)" }],
    ["link con tabulador (java\\tscript:)", { link: "java\tscript:alert(1)" }],
    ["link data:", { link: "data:text/html,<script>alert(1)</script>" }],
    ["link con comillas", { link: 'https://ok.test/" onmouseover="alert(1)' }],
    ["link relativo al protocolo", { link: "//evil.test/x" }],
    ["imagen con comillas", { before_media_url: `${PRODUCT_IMG}" onerror="alert(1)` }],
    ["imagen externa", { after_media_url: "https://evil.test/x.webp" }],
    ["imagen con traversal", { before_media_url: "/api/media/events/../products/a.webp" }],
    ["galería con javascript:", { gallery_json: JSON.stringify(["javascript:alert(1)"]) }],
    ["galería con comillas", { gallery_json: JSON.stringify(['x" onerror="alert(1)']) }],
    ["galería que no es arreglo", { gallery_json: JSON.stringify({ src: PRODUCT_IMG }) }],
    ["galería que no es JSON", { gallery_json: "no-es-json" }],
  ];

  for (const [name, patch] of INVALID) {
    it(`rechaza en POST y en PUT: ${name}`, async () => {
      const token = await accessJwt();
      await insertRow("events", { id: 1, title: "Original", event_type: "social", status: "published" });

      const created = await call("POST", "/api/events", { token, body: { title: "Nuevo", ...patch } });
      expect(created.status).toBe(400);

      const updated = await call("PUT", "/api/events/1", { token, body: patch });
      expect(updated.status).toBe(400);

      expect(await eventRow(1)).toMatchObject({ title: "Original", event_type: "social", status: "published" });
      expect(await eventCount()).toBe(1);
    });
  }

  it("updateEvent rechaza un event_type inválido con 400 y no toca la fila", async () => {
    await insertRow("events", { id: 1, title: "Original", event_type: "social", status: "published" });
    const res = await call("PUT", "/api/events/1", { token: await accessJwt(), body: { event_type: "fiesta" } });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid event_type. Must be one of: corporativo, social, concierto" });
    expect(await eventRow(1)).toMatchObject({ event_type: "social" });
  });

  it("un cuerpo que no es un objeto JSON → 400", async () => {
    const token = await accessJwt();
    await insertRow("events", { id: 1, title: "Original", status: "published" });
    for (const body of ["no es json", "[]", "null"]) {
      expect((await call("POST", "/api/events", { token, body })).status).toBe(400);
      expect((await call("PUT", "/api/events/1", { token, body })).status).toBe(400);
    }
  });

  it("un título con HTML se guarda como texto literal; el render lo muestra inerte", async () => {
    const payload = '"><img src=x onerror=alert(1)>';
    const res = await call("POST", "/api/events", { token: await accessJwt(), body: { title: payload, status: "published" } });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ title: payload });
  });
});

// -----------------------------------------------------------------------------
// Fase 4 — un evento solo puede borrar imágenes de events/
// -----------------------------------------------------------------------------

describe("Fase 4 — borrado en R2 limitado a events/", () => {
  it("mediaKeyFromUrl solo resuelve imágenes de las carpetas permitidas", () => {
    const EVENTS = ["events"];
    expect(mediaKeyFromUrl(EVENT_IMG_OLD, EVENTS)).toBe("events/1edf0c65-2704-4992-b574-689ae5ea8024.webp");
    expect(mediaKeyFromUrl("/api/media/events/foto-640.webp", EVENTS)).toBe("events/foto-640.webp");
    expect(mediaKeyFromUrl("/api/media/events/foto.jpeg", EVENTS)).toBe("events/foto.jpeg");

    const rejected: unknown[] = [
      PRODUCT_IMG, // otra entidad
      "/api/media/hero/portada.webp",
      "/api/media/avatars/a.png",
      "/api/media/cards/a.webp",
      "/api/media/events/../products/a.webp", // traversal
      "/api/media/events/..%2Fproducts%2Fa.webp", // traversal codificado
      "/api/media/events/%2e%2e/products/a.webp",
      "/api/media/events%2F..%2Fproducts/a.webp",
      "/api/media/events/sub/a.webp", // subcarpeta
      "/api/media/events//a.webp",
      "/api/media/events/a.webp?x=1",
      "/api/media/events/a.webp#x",
      "/api/media/events/a.webp\n",
      " /api/media/events/a.webp",
      "/api/media/EVENTS/a.webp",
      "/api/media/events/a.svg",
      "/api/media/events/a",
      "/api/media/events/.webp",
      "\\api\\media\\events\\a.webp",
      "https://stratonaudio.com.co/api/media/events/a.webp",
      "events/a.webp",
      "",
      null,
      42,
    ];
    for (const url of rejected) {
      expect(mediaKeyFromUrl(url, EVENTS), String(url)).toBeNull();
    }
  });

  // Registros que ya estuvieran en D1 apuntando fuera de events/ (heredados
  // o sembrados por alguien antes del hotfix): reemplazarlos no borra nada.
  const FOREIGN: Array<[name: string, stored: string]> = [
    ["products/", PRODUCT_IMG],
    ["hero/", "/api/media/hero/portada.webp"],
    ["una clave arbitraria con traversal", "/api/media/events/../products/76586a03.webp"],
    ["una URL absoluta", "https://stratonaudio.com.co/api/media/events/a.webp"],
  ];

  for (const [name, stored] of FOREIGN) {
    it(`reemplazar una imagen guardada en ${name} no la borra de R2`, async () => {
      const { bucket, deleted } = recordingBucket();
      await insertRow("events", { id: 1, title: "Ev", status: "published", before_media_url: stored, after_media_url: stored });
      const res = await call("PUT", "/api/events/1", {
        token: await accessJwt(),
        env: testEnv({ STRATON_BUCKET: bucket }),
        body: { before_media_url: EVENT_IMG_NEW, after_media_url: null },
      });
      expect(res.status).toBe(200);
      expect(deleted).toEqual([]);
    });
  }

  it("reemplazar una imagen propia de events/ la borra, y solo esa", async () => {
    const { bucket, deleted } = recordingBucket();
    await insertRow("events", {
      id: 1,
      title: "Ev",
      status: "published",
      before_media_url: EVENT_IMG_OLD,
      after_media_url: "/api/media/events/despues.webp",
    });
    const res = await call("PUT", "/api/events/1", {
      token: await accessJwt(),
      env: testEnv({ STRATON_BUCKET: bucket }),
      body: { before_media_url: EVENT_IMG_NEW },
    });
    expect(res.status).toBe(200);
    expect(deleted).toEqual(["events/1edf0c65-2704-4992-b574-689ae5ea8024.webp"]);
    expect(await eventRow(1)).toMatchObject({ before_media_url: EVENT_IMG_NEW, after_media_url: "/api/media/events/despues.webp" });
  });

  it("si la actualización se rechaza no se borra nada", async () => {
    const { bucket, deleted } = recordingBucket();
    await insertRow("events", { id: 1, title: "Ev", status: "published", before_media_url: EVENT_IMG_OLD });
    const res = await call("PUT", "/api/events/1", {
      token: await accessJwt(),
      env: testEnv({ STRATON_BUCKET: bucket }),
      body: { before_media_url: EVENT_IMG_NEW, link: "javascript:alert(1)" },
    });
    expect(res.status).toBe(400);
    expect(deleted).toEqual([]);
    expect(await eventRow(1)).toMatchObject({ before_media_url: EVENT_IMG_OLD });
  });
});

// -----------------------------------------------------------------------------
// Fase 5 — borradores privados
// -----------------------------------------------------------------------------

describe("Fase 5 — los borradores solo los ve el panel", () => {
  const ENTITIES: Array<[table: string, base: string, row: (id: number, status: string) => Record<string, unknown>]> = [
    ["events", "/api/events", (id, status) => ({ id, title: `Evento ${status}`, status })],
    ["products", "/api/products", (id, status) => ({ id, title: `Producto ${status}`, category: "Audio", service_type: "Venta", status })],
    ["services", "/api/services", (id, status) => ({ id, title: `Servicio ${status}`, status })],
    ["packages", "/api/packages", (id, status) => ({ id, name: `Paquete ${status}`, status })],
    ["testimonials", "/api/testimonials", (id, status) => ({ id, client_name: `Cliente ${status}`, quote: "Excelente", status })],
    ["pages", "/api/pages", (id, status) => ({ id, slug: `pagina-${status}`, title: `Página ${status}`, status })],
  ];

  async function seed(table: string, row: (id: number, status: string) => Record<string, unknown>) {
    await insertRow(table, row(1, "published"));
    await insertRow(table, row(2, "draft"));
  }

  for (const [table, base, row] of ENTITIES) {
    it(`${base}?status=all o ?status=draft sin sesión → 401 sin consultar D1`, async () => {
      const { db, state } = trapDb();
      for (const query of ["?status=all", "?status=draft", "?status=ALL"]) {
        const res = await call("GET", base + query, { env: testEnv({ STRATON_DB: db }) });
        expect(res.status).toBe(401);
      }
      expect(state.touched).toBe(false);
    });

    it(`${base}/:id de un borrador: 404 sin sesión, 200 con sesión; lo publicado sigue público`, async () => {
      await seed(table, row);
      expect((await call("GET", `${base}/2`)).status).toBe(404);
      expect((await call("GET", `${base}/2`, { token: await accessJwt() })).status).toBe(200);
      expect((await call("GET", `${base}/1`)).status).toBe(200);
    });

    it(`${base}?status=all con sesión incluye los borradores`, async () => {
      await seed(table, row);
      const res = await call("GET", `${base}?status=all`, { token: await accessJwt() });
      expect(res.status).toBe(200);
      const ids = ((await res.json()) as Array<{ id: number }>).map((r) => r.id).sort();
      expect(ids).toEqual([1, 2]);
    });
  }

  it("GET /api/events público devuelve solo lo publicado, con o sin ?status=published", async () => {
    await seed("events", (id, status) => ({ id, title: `Evento ${status}`, status }));
    for (const query of ["", "?status=published", "?status="]) {
      const res = await call("GET", `/api/events${query}`);
      expect(res.status).toBe(200);
      const rows = (await res.json()) as Array<{ id: number; status: string }>;
      expect(rows.map((r) => r.status)).toEqual(["published"]);
    }
  });
});

// -----------------------------------------------------------------------------
// Fase 6 — productos: la imagen vieja se borra de R2 solo tras un UPDATE exitoso
// -----------------------------------------------------------------------------

describe("Fase 6 — updateProduct borra la imagen vieja solo si D1 aceptó el cambio", () => {
  const OLD_KEY = "products/0c4a1f2e-6b7d-4e8f-9a0b-1c2d3e4f5a61.webp";
  const NEW_KEY = "products/7e8f9a0b-1c2d-4e3f-8a5b-6c7d8e9f0a12.webp";
  const OLD_URL = `/api/media/${OLD_KEY}`;
  const NEW_URL = `/api/media/${NEW_KEY}`;

  /** El R2 emulado real, con un registro de las claves que se piden borrar. */
  function spyBucket() {
    const deleted: string[] = [];
    const real = env.STRATON_BUCKET;
    const bucket = {
      delete: (key: string) => {
        deleted.push(key);
        return real.delete(key);
      },
    } as unknown as R2Bucket;
    return { bucket, deleted };
  }

  const productRow = (id: number) => env.STRATON_DB.prepare("SELECT * FROM products WHERE id = ?").bind(id).first();
  const putObject = (key: string) => env.STRATON_BUCKET.put(key, new Uint8Array([82, 73, 70, 70]), { httpMetadata: { contentType: "image/webp" } });

  /** deleteR2Object no se espera (fire-and-forget): sondeo acotado, 20 × 10 ms. */
  async function goneFromR2(key: string): Promise<boolean> {
    for (let i = 0; i < 20; i++) {
      if ((await env.STRATON_BUCKET.head(key)) === null) return true;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    return false;
  }

  beforeEach(async () => {
    await putObject(OLD_KEY);
    await putObject(NEW_KEY);
    await insertRow("products", { id: 1, title: "Prod", category: "Audio", service_type: "Venta", status: "published", image_url: OLD_URL });
  });

  it("si D1 rechaza el UPDATE, la imagen vieja sigue en R2 y en la fila", async () => {
    const { bucket, deleted } = spyBucket();
    // El CHECK de service_type lo conserva la migración 010, a diferencia del de category.
    const res = await call("PUT", "/api/products/1", {
      token: await accessJwt(),
      env: testEnv({ STRATON_BUCKET: bucket }),
      body: { image_url: NEW_URL, service_type: "Trueque" },
    });
    expect(res.status).toBe(500);
    expect(await productRow(1)).toMatchObject({ image_url: OLD_URL, service_type: "Venta" });
    expect(deleted).toEqual([]);
    expect(await env.STRATON_BUCKET.head(OLD_KEY)).not.toBeNull();
  });

  it("si el UPDATE se guarda, la fila apunta a la nueva y la vieja se borra de R2", async () => {
    const { bucket, deleted } = spyBucket();
    const res = await call("PUT", "/api/products/1", {
      token: await accessJwt(),
      env: testEnv({ STRATON_BUCKET: bucket }),
      body: { image_url: NEW_URL },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: 1, image_url: NEW_URL });
    expect(await productRow(1)).toMatchObject({ image_url: NEW_URL });
    expect(deleted).toEqual([OLD_KEY]);
    expect(await goneFromR2(OLD_KEY)).toBe(true);
    expect(await env.STRATON_BUCKET.head(NEW_KEY)).not.toBeNull();
  });

  const NO_DELETE: Array<[name: string, stored: string | null, body: Record<string, unknown>]> = [
    ["el body no trae image_url", OLD_URL, { title: "Prod editado" }],
    ["la image_url nueva es igual a la actual", OLD_URL, { image_url: OLD_URL, title: "Prod editado" }],
    ["la fila no tenía imagen", null, { image_url: NEW_URL }],
    ["la imagen vieja es de otra carpeta", "/api/media/events/1edf0c65-2704-4992-b574-689ae5ea8024.webp", { image_url: NEW_URL }],
    ["la imagen vieja es una URL absoluta", `https://stratonaudio.com.co${OLD_URL}`, { image_url: NEW_URL }],
    ["la imagen vieja intenta salir de products/", "/api/media/products/../hero/portada.webp", { image_url: NEW_URL }],
  ];

  for (const [name, stored, body] of NO_DELETE) {
    it(`no pide borrar nada en R2 cuando ${name}`, async () => {
      await env.STRATON_DB.prepare("UPDATE products SET image_url = ? WHERE id = 1").bind(stored).run();
      const { bucket, deleted } = spyBucket();
      const res = await call("PUT", "/api/products/1", { token: await accessJwt(), env: testEnv({ STRATON_BUCKET: bucket }), body });
      expect(res.status).toBe(200);
      expect(deleted).toEqual([]);
      expect(await env.STRATON_BUCKET.head(OLD_KEY)).not.toBeNull();
    });
  }
});
