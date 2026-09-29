/**
 * Formularios de cotización (2026-09-28): validación, mensaje de éxito y la
 * señal lead_form_success que GTM usa para la conversión de formulario.
 *
 * Es hermética, como portafolio-xss.mjs: sirve public/ desde el disco bajo un
 * origen ficticio y aborta toda petición a terceros (GTM incluido, así que
 * nunca sale una conversión real). POST /api/quotations responde lo que fija
 * cada escenario; las reglas del servidor se prueban en
 * test/api-seguridad.spec.ts (Fase 8). Para cada formulario:
 *
 *   A. datos incompletos  → sin petición, sin éxito, sin evento
 *   B. datos inválidos    → ídem; y si alguien salta la validación del
 *                           navegador, el 400 del servidor tampoco da éxito
 *   C. sin confirmación   → 429, 5xx, fallo de red, timeout o respuesta sin
 *                           id: sin éxito ni evento. En el modal del carrito
 *                           WhatsApp sigue disponible, sin un segundo registro
 *   D. datos válidos      → éxito y exactamente un lead_form_success
 *   E. doble clic, Enter  → una sola petición y un solo evento, que no
 *                           aparece mientras la respuesta está pendiente
 *
 *   node test/e2e/formularios-lead.mjs
 */
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(import.meta.url)(
  "C:/Users/USUARIO/dev/tools/playwright/node_modules/playwright"
);

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public");
const ORIGIN = "https://straton.test";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

const SEND_ERROR = "No pudimos enviar tu solicitud. Intenta de nuevo o contáctanos por WhatsApp.";
const PHONE_ERROR = "El teléfono no es válido: usa entre 7 y 15 dígitos.";
const EMAIL_ERROR = "El correo electrónico no es válido.";

// Página dinámica con el bloque contact-form, como la inyecta el Worker.
const PAGINA = {
  id: 9, slug: "prueba-formulario", title: "Prueba", status: "published",
  content_json: [{ type: "contact-form", props: { title: "Escríbenos" } }],
};

// Respuesta del próximo POST /api/quotations y los cuerpos recibidos.
let plan = null;
const posts = [];

function responder(nuevo) {
  plan = nuevo;
}

/** Respuesta retenida hasta que el escenario llame a liberar(). */
function retenida(status, json) {
  let liberar;
  const hold = new Promise((resolve) => (liberar = resolve));
  return { plan: { status, json, hold }, liberar };
}

const MSG_429 = "Demasiadas solicitudes. Intenta de nuevo en una hora.";
const F2_SIN_REGISTRO = "No pudimos registrar tu cotización automáticamente. Puedes enviarla igual: toca «Abrir WhatsApp».";

// [escenario, respuesta, mensaje que muestran F1 y F3]
const ERRORES_SERVIDOR = [
  ["429", { status: 429, json: { error: MSG_429 } }, MSG_429],
  ["500", { status: 500, json: { error: "Internal server error" } }, SEND_ERROR],
  ["fallo de red", { abort: true }, SEND_ERROR],
  ["200 sin id", { status: 200, json: { ok: true } }, SEND_ERROR],
  ["201 sin cuerpo", { status: 201, raw: "" }, SEND_ERROR],
];

const resultados = [];
function comprobar(nombre, ok, detalle = "") {
  resultados.push({ nombre, ok, detalle });
  console.log(`  ${ok ? "OK   " : "FALLA"}  ${nombre}${detalle && !ok ? "  ->  " + detalle : ""}`);
}

const leads = (page) =>
  page.evaluate(() => (window.dataLayer || []).filter((e) => e && e.event === "lead_form_success"));

const esperar = (page, fn, arg) => page.waitForFunction(fn, arg, { timeout: 5000 }).catch(() => {});

/** El evento es exactamente { event, form_id } y no arrastra datos personales. */
function eventoLimpio(lista, formId) {
  return (
    lista.length === 1 &&
    JSON.stringify(Object.keys(lista[0]).sort()) === JSON.stringify(["event", "form_id"]) &&
    lista[0].event === "lead_form_success" &&
    lista[0].form_id === formId
  );
}

const navegador = await chromium.launch();
const dialogos = [];
const errores = [];
try {
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } });

  await contexto.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== ORIGIN) return route.abort();
    if (url.pathname === "/api/quotations" && request.method() === "POST") {
      posts.push(JSON.parse(request.postData() || "null"));
      const actual = plan || { status: 500, json: { error: "sin plan" } };
      if (actual.hold) await actual.hold;
      // Tras un timeout el navegador ya abortó la petición: responder puede fallar.
      try {
        if (actual.abort) return await route.abort("failed");
        return await route.fulfill({
          status: actual.status,
          contentType: actual.contentType || "application/json",
          body: actual.raw ?? JSON.stringify(actual.json),
        });
      } catch {
        return;
      }
    }
    if (url.pathname.startsWith("/api/media/")) return route.fulfill({ status: 404, body: "" });
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname === "/api/settings") return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
      if (url.pathname.startsWith("/api/pages/")) return route.fulfill({ status: 404, contentType: "application/json", body: '{"error":"Page not found"}' });
      return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    }
    // Cualquier ruta sin extensión es una página: index.html (así la sirve el Worker).
    const archivo = path.extname(url.pathname)
      ? path.join(PUBLIC_DIR, decodeURIComponent(url.pathname))
      : path.join(PUBLIC_DIR, "index.html");
    if (!archivo.startsWith(PUBLIC_DIR)) return route.fulfill({ status: 404, body: "" });
    try {
      const body = await readFile(archivo);
      return route.fulfill({ status: 200, contentType: TYPES[path.extname(archivo)] || "application/octet-stream", body });
    } catch {
      return route.fulfill({ status: 404, body: "" });
    }
  });

  async function abrir(ruta, { pagina } = {}) {
    const page = await contexto.newPage();
    page.on("dialog", (d) => {
      dialogos.push(d.message());
      d.dismiss().catch(() => {});
    });
    page.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
    if (pagina) await page.addInitScript((p) => (window.__PAGE__ = p), pagina);
    await page.goto(ORIGIN + ruta, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => typeof window.StratonLead === "object" && typeof window.handleContactSubmit === "function");
    posts.length = 0;
    plan = null;
    return page;
  }

  /** Simula que alguien quita la validación del navegador (DevTools). */
  const saltarValidacion = (page) => page.evaluate(() => (window.StratonLead.validate = () => null));

  // ===========================================================================
  // F1 · #quotationForm (home, #contacto) → quote_form
  // ===========================================================================
  console.log("--- F1 · #quotationForm (quote_form) ---");

  const F1_VALIDO = {
    customer_name: "Ana Pérez", email: "ana@example.com", phone: "+57 300 123 4567",
    city: "Bogotá", notes: "Boda para 150 personas",
  };
  async function llenarF1(page, datos) {
    for (const [name, value] of Object.entries(datos)) await page.fill(`#quotationForm [name="${name}"]`, value);
  }
  const estadoF1 = (page) =>
    page.evaluate(() => ({
      mensaje: document.querySelector("#formMessages")?.textContent.trim() ?? null,
      foco: document.activeElement?.getAttribute("name"),
      invalido: document.querySelector('#quotationForm [aria-invalid="true"]')?.getAttribute("name") ?? null,
      exito: !!document.querySelector("#quotationForm .form-success"),
      boton: document.querySelector("#formSubmit") && {
        disabled: document.querySelector("#formSubmit").disabled,
        texto: document.querySelector("#formSubmit").textContent.trim(),
      },
    }));

  {
    const page = await abrir("/");
    await page.click("#formSubmit");
    let r = await estadoF1(page);
    comprobar("A · vacío: dice qué falta y enfoca el campo",
      r.mensaje === "Completa el nombre." && r.foco === "customer_name" && r.invalido === "customer_name", JSON.stringify(r));

    await llenarF1(page, { customer_name: "Ana Pérez", email: "ana@example.com" });
    await page.click("#formSubmit");
    r = await estadoF1(page);
    comprobar("A · sin teléfono: dice qué falta y enfoca el campo",
      r.mensaje === "Completa el teléfono." && r.foco === "phone", JSON.stringify(r));

    await llenarF1(page, { email: "ana@example", phone: "300 123 4567" });
    await page.click("#formSubmit");
    r = await estadoF1(page);
    comprobar("B · email inválido: lo rechaza y enfoca el campo", r.mensaje === EMAIL_ERROR && r.foco === "email", JSON.stringify(r));

    await llenarF1(page, { email: "ana@example.com", phone: "300 12" });
    await page.click("#formSubmit");
    r = await estadoF1(page);
    comprobar("B · teléfono inválido: lo rechaza y enfoca el campo", r.mensaje === PHONE_ERROR && r.foco === "phone", JSON.stringify(r));

    comprobar("A/B · ninguna petición al servidor", posts.length === 0, `posts=${posts.length}`);
    comprobar("A/B · ni éxito ni lead_form_success", !r.exito && (await leads(page)).length === 0);

    await saltarValidacion(page);
    responder({ status: 400, json: { error: PHONE_ERROR, field: "phone" } });
    await page.click("#formSubmit");
    await esperar(page, () => !document.querySelector("#formSubmit").disabled && document.querySelector("#formMessages").textContent);
    r = await estadoF1(page);
    comprobar("B · validación saltada: el 400 del servidor se muestra y marca el campo",
      posts.length === 1 && r.mensaje === PHONE_ERROR && r.invalido === "phone" && !r.exito, JSON.stringify(r));
    comprobar("B · validación saltada: sin lead_form_success", (await leads(page)).length === 0);
    await page.close();
  }

  for (const [nombre, respuesta, mensaje] of ERRORES_SERVIDOR) {
    const page = await abrir("/");
    await llenarF1(page, F1_VALIDO);
    responder(respuesta);
    await page.click("#formSubmit");
    await esperar(page, () => !document.querySelector("#formSubmit").disabled && document.querySelector("#formMessages").textContent);
    const r = await estadoF1(page);
    const l = await leads(page);
    comprobar(`C · ${nombre}: sin éxito ni evento, mensaje y botón habilitado`,
      posts.length === 1 && !r.exito && l.length === 0 && r.mensaje === mensaje && r.boton?.disabled === false,
      JSON.stringify({ posts: posts.length, r, leads: l.length }));
    await page.close();
  }

  {
    const page = await abrir("/");
    await llenarF1(page, F1_VALIDO);
    const { plan: p, liberar } = retenida(201, { id: 101, customer_name: "Ana Pérez", status: "pending" });
    responder(p);
    await page.dblclick("#formSubmit");
    await page.press('#quotationForm [name="city"]', "Enter");
    await page.evaluate(() => document.getElementById("quotationForm").dispatchEvent(new Event("submit", { cancelable: true })));
    await page.waitForTimeout(400);
    let r = await estadoF1(page);
    const pendientes = await leads(page);
    comprobar("E · doble clic + Enter + submit repetido: una sola petición", posts.length === 1, `posts=${posts.length}`);
    comprobar("E · con la respuesta pendiente no hay evento ni éxito",
      pendientes.length === 0 && !r.exito && r.boton?.disabled === true && r.boton?.texto === "Enviando...", JSON.stringify(r));

    liberar();
    await page.waitForSelector("#quotationForm .form-success", { timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(600);
    r = await estadoF1(page);
    const l = await leads(page);
    comprobar("D · 201 con id: mensaje de éxito", r.exito);
    comprobar("D · exactamente un lead_form_success { event, form_id: 'quote_form' }", eventoLimpio(l, "quote_form"), JSON.stringify(l));
    comprobar("D · el payload lleva form_id y el evento ningún dato personal",
      posts[0]?.form_id === "quote_form" && !/Ana|@|300|Bogot|Boda/.test(JSON.stringify(l)), JSON.stringify(l));
    await page.evaluate(() => window.StratonLead.pushSuccess("quote_form", 101));
    comprobar("E · la misma cotización procesada dos veces no duplica el evento", (await leads(page)).length === 1);
    await page.close();
  }

  // ===========================================================================
  // F2 · modal del carrito → WhatsApp (cart_whatsapp_form)
  // ===========================================================================
  console.log("--- F2 · modal del carrito (cart_whatsapp_form) ---");

  async function abrirModal({ bloquearVentanas = false } = {}) {
    const page = await abrir("/");
    await page.evaluate((bloquear) => {
      window.__bloquearVentanas = bloquear;
      window.__abiertas = [];
      window.open = (url, target) => {
        const antes = (window.dataLayer || []).filter((e) => e && e.event === "lead_form_success").length;
        window.__abiertas.push({ url, target, leadsAntes: antes });
        return window.__bloquearVentanas ? null : {};
      };
      const boton = document.createElement("button");
      boton.id = "__agregar";
      boton.textContent = "Añadir";
      boton.style.cssText = "position:fixed;top:120px;left:10px;z-index:99999";
      boton.setAttribute("data-add-to-cart", JSON.stringify({ id: 1, name: "Line array", price: 500000, type: "product" }));
      document.body.appendChild(boton);
    }, bloquearVentanas);
    await page.click("#__agregar");
    await page.click("#cart-bar-whatsapp");
    await page.waitForSelector("#clientModal", { state: "visible" });
    return page;
  }
  async function llenarF2(page, { nombre, telefono, email }) {
    if (nombre !== undefined) await page.fill("#modalName", nombre);
    if (telefono !== undefined) await page.fill("#modalPhone", telefono);
    if (email !== undefined) await page.fill("#modalEmail", email);
  }
  const enviarF2 = (page) => page.click('#clientModalForm button[type="submit"]');
  const estadoF2 = (page) =>
    page.evaluate(() => {
      const status = document.getElementById("modalStatus");
      const boton = document.querySelector('#clientModalForm button[type="submit"]');
      return {
        mensaje: status.hidden ? "" : status.textContent,
        foco: document.activeElement?.id,
        visible: document.getElementById("clientModal").style.display !== "none",
        abiertas: window.__abiertas,
        boton: { disabled: boton.disabled, texto: boton.textContent.trim() },
        nombreInvalidoNativo: document.getElementById("modalName").matches(":invalid"),
      };
    });

  {
    const page = await abrirModal();
    await enviarF2(page);
    let r = await estadoF2(page);
    comprobar("A · vacío: la validación del navegador lo detiene en el nombre", r.nombreInvalidoNativo && r.abiertas.length === 0, JSON.stringify(r));

    await llenarF2(page, { nombre: "   ", telefono: "300 123 4567" });
    await enviarF2(page);
    r = await estadoF2(page);
    comprobar("A · nombre con solo espacios: dice qué falta y enfoca el campo",
      r.mensaje === "Completa el nombre." && r.foco === "modalName", JSON.stringify(r));

    await llenarF2(page, { nombre: "Ana Pérez", telefono: "12345" });
    await enviarF2(page);
    r = await estadoF2(page);
    comprobar("B · teléfono de 5 dígitos: lo rechaza y enfoca el campo", r.mensaje === PHONE_ERROR && r.foco === "modalPhone", JSON.stringify(r));

    await llenarF2(page, { telefono: "300 123 4567", email: "ana@example" });
    await enviarF2(page);
    r = await estadoF2(page);
    comprobar("B · email escrito e inválido: lo rechaza y enfoca el campo", r.mensaje === EMAIL_ERROR && r.foco === "modalEmail", JSON.stringify(r));

    comprobar("A/B · no registra, no abre WhatsApp, sin evento",
      posts.length === 0 && r.abiertas.length === 0 && (await leads(page)).length === 0, `posts=${posts.length} abiertas=${r.abiertas.length}`);

    await saltarValidacion(page);
    responder({ status: 400, json: { error: PHONE_ERROR, field: "phone" } });
    await llenarF2(page, { telefono: "12", email: "" });
    await enviarF2(page);
    await esperar(page, () => !document.querySelector('#clientModalForm button[type="submit"]').disabled && !document.getElementById("modalStatus").hidden);
    r = await estadoF2(page);
    comprobar("B · validación saltada: el 400 se muestra, no abre WhatsApp ni emite evento",
      posts.length === 1 && r.mensaje === PHONE_ERROR && r.abiertas.length === 0 && (await leads(page)).length === 0, JSON.stringify(r));
    await page.close();
  }

  // Mensaje exacto que armaba el código anterior para este carrito.
  const whatsappEsperado = (page) =>
    page.evaluate(() =>
      "https://api.whatsapp.com/send?phone=573102646751&text=" + encodeURIComponent(
        "🎉 *Hola Straton Audio, quiero esta cotización:*\n\n" +
        "📋 *Detalle del pedido*\n──────────────────\n" +
        "▸ 1x Line array\n" +
        "──────────────────\n" +
        "💰 *Total estimado:* $" + (500000).toLocaleString("es-CO") + "\n\n" +
        "👤 *Nombre:* Ana Pérez\n" +
        "📧 *Email:* \n" +
        "📱 *Teléfono:* 300 123 4567\n" +
        "\n¿Me confirman disponibilidad y los detalles? 🙌"
      ));
  const botonF2 = () => document.querySelector('#clientModalForm button[type="submit"]').textContent === "Abrir WhatsApp";

  /** Sin confirmación del servidor: 0 eventos, aviso y WhatsApp a un clic, sin
   *  un segundo registro. `enviar` dispara el envío y espera el aviso. */
  async function comprobarSinRegistroF2(nombre, enviar) {
    const page = await abrirModal();
    await llenarF2(page, { nombre: "Ana Pérez", telefono: "300 123 4567" });
    await enviar(page);
    let r = await estadoF2(page);
    comprobar(`C · ${nombre}: backend no confirmó → 0 lead_form_success, aviso y WhatsApp disponible`,
      posts.length === 1 && (await leads(page)).length === 0 && r.mensaje === F2_SIN_REGISTRO && r.visible &&
        r.boton.texto === "Abrir WhatsApp" && r.boton.disabled === false && r.abiertas.length === 0,
      JSON.stringify({ posts: posts.length, r }));
    await enviarF2(page);
    r = await estadoF2(page);
    comprobar(`C · ${nombre}: el clic abre WhatsApp con el mismo mensaje, sin segundo registro ni evento`,
      posts.length === 1 && (await leads(page)).length === 0 && r.abiertas.length === 1 &&
        r.abiertas[0].url === (await whatsappEsperado(page)) && r.abiertas[0].target === "_blank" && !r.visible,
      JSON.stringify({ posts: posts.length, abiertas: r.abiertas, visible: r.visible }));
    await page.close();
  }

  for (const [nombre, respuesta] of [
    ...ERRORES_SERVIDOR,
    ["503 con página HTML", { status: 503, contentType: "text/html", raw: "<html>Service Unavailable</html>" }],
  ]) {
    await comprobarSinRegistroF2(nombre, async (page) => {
      responder(respuesta);
      await enviarF2(page);
      await esperar(page, botonF2);
    });
  }

  // Timeout: el servidor no responde en 10 s. La respuesta tardía ya no cuenta.
  {
    let liberar;
    let pendienteA9s;
    await comprobarSinRegistroF2("timeout (10 s)", async (page) => {
      const retenidaTarde = retenida(201, { id: 299, status: "pending" });
      liberar = retenidaTarde.liberar;
      responder(retenidaTarde.plan);
      await enviarF2(page);
      await page.waitForTimeout(9000);
      pendienteA9s = await estadoF2(page);
      pendienteA9s.leads = (await leads(page)).length;
      await esperar(page, botonF2);
    });
    comprobar("C · timeout: a los 9 s sigue esperando, sin evento ni WhatsApp",
      pendienteA9s.boton.texto === "Enviando..." && pendienteA9s.leads === 0 && pendienteA9s.abiertas.length === 0,
      JSON.stringify(pendienteA9s));
    liberar();
  }

  {
    const page = await abrirModal();
    await llenarF2(page, { nombre: "Ana Pérez", telefono: "300 123 4567" });
    const { plan: p, liberar } = retenida(201, { id: 202, status: "pending" });
    responder(p);
    await page.dblclick('#clientModalForm button[type="submit"]');
    await page.evaluate(() => document.getElementById("clientModalForm").dispatchEvent(new Event("submit", { cancelable: true })));
    await page.waitForTimeout(400);
    let r = await estadoF2(page);
    comprobar("E · doble clic + submit repetido: una sola petición", posts.length === 1, `posts=${posts.length}`);
    comprobar("E · con la respuesta pendiente no hay evento ni WhatsApp",
      (await leads(page)).length === 0 && r.abiertas.length === 0 && r.boton.texto === "Enviando...", JSON.stringify(r));

    liberar();
    await esperar(page, () => document.getElementById("clientModal").style.display === "none");
    await page.waitForTimeout(400);
    r = await estadoF2(page);
    const l = await leads(page);
    comprobar("D · exactamente un lead_form_success { event, form_id: 'cart_whatsapp_form' }", eventoLimpio(l, "cart_whatsapp_form"), JSON.stringify(l));
    comprobar("D · WhatsApp se abre una vez, en pestaña nueva, después del evento",
      r.abiertas.length === 1 && r.abiertas[0].target === "_blank" && r.abiertas[0].leadsAntes === 1 && !r.visible, JSON.stringify(r.abiertas));
    comprobar("D · el mensaje y la URL de WhatsApp no cambian", r.abiertas[0]?.url === (await whatsappEsperado(page)), r.abiertas[0]?.url);
    comprobar("D · el payload lleva form_id y las notas de siempre",
      posts[0]?.form_id === "cart_whatsapp_form" && posts[0]?.notes === "Cotización enviada desde WhatsApp" && /Line array/.test(posts[0]?.products_json),
      JSON.stringify(posts[0]));
    await page.close();
  }

  {
    const page = await abrirModal({ bloquearVentanas: true });
    await llenarF2(page, { nombre: "Ana Pérez", telefono: "300 123 4567" });
    responder({ status: 201, json: { id: 203, status: "pending" } });
    await enviarF2(page);
    await esperar(page, () => document.querySelector('#clientModalForm button[type="submit"]').textContent === "Abrir WhatsApp");
    let r = await estadoF2(page);
    comprobar("D · ventana bloqueada: queda registrada, un evento y botón «Abrir WhatsApp»",
      r.visible && r.boton.texto === "Abrir WhatsApp" && /quedó registrada/.test(r.mensaje) && (await leads(page)).length === 1,
      JSON.stringify(r));
    await page.evaluate(() => (window.__bloquearVentanas = false));
    await enviarF2(page);
    r = await estadoF2(page);
    comprobar("D · ventana bloqueada: el segundo clic abre WhatsApp sin registrar ni emitir otra vez",
      posts.length === 1 && (await leads(page)).length === 1 && r.abiertas.length === 2 && r.abiertas[1].url === r.abiertas[0].url && !r.visible,
      JSON.stringify({ posts: posts.length, abiertas: r.abiertas.length, visible: r.visible }));
    await page.close();
  }

  // ===========================================================================
  // F3 · bloque contact-form de una página dinámica (contact_form)
  // ===========================================================================
  console.log("--- F3 · bloque contact-form (contact_form) ---");

  async function abrirF3() {
    const page = await abrir("/" + PAGINA.slug, { pagina: PAGINA });
    await page.waitForSelector(".contact-form-dynamic", { timeout: 5000 });
    return page;
  }
  async function llenarF3(page, datos) {
    for (const [name, value] of Object.entries(datos)) await page.fill(`.contact-form-dynamic [name="${name}"]`, value);
  }
  const enviarF3 = (page) => page.click('.contact-form-dynamic button[type="submit"]');
  const estadoF3 = (page) =>
    page.evaluate(() => {
      const form = document.querySelector(".contact-form-dynamic");
      const status = form.querySelector(".contact-form-status");
      const boton = form.querySelector('button[type="submit"]');
      return {
        mensaje: status.textContent,
        clase: status.className,
        foco: document.activeElement?.getAttribute("name"),
        nombreInvalidoNativo: form.querySelector('[name="customer_name"]').matches(":invalid"),
        boton: { disabled: boton.disabled, texto: boton.textContent.trim() },
      };
    });
  const F3_VALIDO = { customer_name: "Ana Pérez", email: "ana@example.com", notes: "Evento para 200 personas" };

  {
    const page = await abrirF3();
    await enviarF3(page);
    let r = await estadoF3(page);
    comprobar("A · vacío: la validación del navegador lo detiene", r.nombreInvalidoNativo && posts.length === 0, JSON.stringify(r));

    await llenarF3(page, { customer_name: "   ", email: "ana@example.com", notes: "   " });
    await enviarF3(page);
    r = await estadoF3(page);
    comprobar("A · campos con solo espacios: dice qué falta y enfoca el campo",
      r.mensaje === "Completa el nombre." && r.foco === "customer_name", JSON.stringify(r));

    await llenarF3(page, { customer_name: "Ana Pérez", email: "ana@example", notes: "Hola" });
    await enviarF3(page);
    r = await estadoF3(page);
    comprobar("B · email inválido: lo rechaza y enfoca el campo", r.mensaje === EMAIL_ERROR && r.foco === "email", JSON.stringify(r));

    await llenarF3(page, { email: "ana@example.com", phone: "abc" });
    await enviarF3(page);
    r = await estadoF3(page);
    comprobar("B · teléfono opcional pero inválido: lo rechaza", r.mensaje === PHONE_ERROR && r.foco === "phone", JSON.stringify(r));

    comprobar("A/B · ninguna petición y sin evento", posts.length === 0 && (await leads(page)).length === 0, `posts=${posts.length}`);

    await saltarValidacion(page);
    responder({ status: 400, json: { error: "Completa el mensaje.", field: "notes" } });
    await llenarF3(page, { phone: "", notes: "x" });
    await enviarF3(page);
    await esperar(page, () => document.querySelector(".contact-form-dynamic .contact-form-status").classList.contains("error") && !document.querySelector('.contact-form-dynamic button[type="submit"]').disabled);
    r = await estadoF3(page);
    comprobar("B · validación saltada: el 400 se muestra, sin éxito ni evento",
      posts.length === 1 && r.mensaje === "Completa el mensaje." && r.foco === "notes" && (await leads(page)).length === 0, JSON.stringify(r));
    await page.close();
  }

  for (const [nombre, respuesta, mensaje] of ERRORES_SERVIDOR) {
    const page = await abrirF3();
    await llenarF3(page, F3_VALIDO);
    responder(respuesta);
    await enviarF3(page);
    await esperar(page, () => document.querySelector(".contact-form-dynamic .contact-form-status").classList.contains("error"));
    const r = await estadoF3(page);
    comprobar(`C · ${nombre}: sin éxito ni evento, mensaje y botón habilitado`,
      posts.length === 1 && r.clase.includes("error") && r.mensaje === mensaje && (await leads(page)).length === 0 && !r.boton.disabled,
      JSON.stringify(r));
    await page.close();
  }

  {
    const page = await abrirF3();
    await llenarF3(page, F3_VALIDO);
    const { plan: p, liberar } = retenida(201, { id: 303, status: "pending" });
    responder(p);
    await page.dblclick('.contact-form-dynamic button[type="submit"]');
    await page.press('.contact-form-dynamic [name="email"]', "Enter");
    await page.evaluate(() => document.querySelector(".contact-form-dynamic").dispatchEvent(new Event("submit", { cancelable: true })));
    await page.waitForTimeout(400);
    let r = await estadoF3(page);
    comprobar("E · doble clic + Enter + submit repetido: una sola petición", posts.length === 1, `posts=${posts.length}`);
    comprobar("E · con la respuesta pendiente no hay evento ni éxito",
      (await leads(page)).length === 0 && !r.clase.includes("success") && r.boton.texto === "Enviando...", JSON.stringify(r));

    liberar();
    await esperar(page, () => document.querySelector(".contact-form-dynamic .contact-form-status").classList.contains("success"));
    await page.waitForTimeout(400);
    r = await estadoF3(page);
    let l = await leads(page);
    comprobar("D · 201 con id: «Mensaje enviado. ¡Gracias!»", r.mensaje === "Mensaje enviado. ¡Gracias!", JSON.stringify(r));
    comprobar("D · exactamente un lead_form_success { event, form_id: 'contact_form' }", eventoLimpio(l, "contact_form"), JSON.stringify(l));
    comprobar("D · el payload lleva form_id", posts[0]?.form_id === "contact_form", JSON.stringify(posts[0]));

    // Una segunda cotización distinta es otro lead: otro evento, no más.
    await llenarF3(page, { ...F3_VALIDO, customer_name: "Luis Gómez" });
    responder({ status: 201, json: { id: 304, status: "pending" } });
    await enviarF3(page);
    await esperar(page, () => (window.dataLayer || []).filter((e) => e && e.event === "lead_form_success").length === 2);
    l = await leads(page);
    comprobar("D · una segunda cotización aceptada emite su propio evento (uno por lead)", l.length === 2 && posts.length === 2, `leads=${l.length} posts=${posts.length}`);
    await page.close();
  }

  console.log("--- general ---");
  {
    const page = await abrir("/");
    const problemas = await page.evaluate(() =>
      ["quote_form", "contact_form", "cart_whatsapp_form"].map((formId) =>
        window.StratonLead.validate(formId, { customer_name: "A", email: "ana@example.com", phone: "3001234567", notes: "Hola" })
      ));
    comprobar("el nombre solo tiene que no estar vacío (sin longitud mínima)", problemas.every((p) => p === null), JSON.stringify(problemas));
    await page.close();
  }
  comprobar("ningún alert()/confirm() en ningún escenario", dialogos.length === 0, dialogos.join(" | "));
  comprobar("app.js no lanzó excepciones", errores.length === 0, errores.join(" | "));

  await contexto.close();
} finally {
  await navegador.close();
}

const fallos = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - fallos.length}/${resultados.length} comprobaciones correctas.`);
process.exit(fallos.length ? 1 : 0);
