/**
 * Pruebas de conversión para el experimento de Google Tag Manager.
 *
 * Se ejecutan contra el banco de pruebas (audit/experimento-gtm/proxy.mjs), que
 * sirve producción real cambiando solo el fragmento de GTM. Nunca se toca
 * producción: las navegaciones a WhatsApp se responden con una página de
 * relleno y los envíos a /api/quotations se interceptan, así que no se abre
 * ningún chat ni se crea ninguna cotización.
 *
 * Preguntas que responde:
 *   A. Un evento disparado ANTES de que exista el contenedor, ¿queda en cola y
 *      lo procesa Tag Manager al cargar? ¿Sale la conversión a Google Ads?
 *   B. Un toque real en un CTA de WhatsApp —que navega en la misma pestaña—
 *      ¿alcanza a enviar la conversión antes de que el documento muera?
 *      Esta es la prueba que decide, y se corre igual en las dos ramas.
 *   C. ¿Una interacción real adelanta la carga del contenedor?
 *   D. El formulario de la home, ¿sigue generando su conversión?
 *
 *   node audit/experimento-gtm/pruebas-conversion.mjs <url-base> <etiqueta>
 */
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(
  "C:/Users/USUARIO/dev/tools/playwright/node_modules/playwright"
);

const BASE = process.argv[2] || "http://127.0.0.1:8799";
const RAMA = process.argv[3] || "sin-nombre";

// Leídas del contenedor público GTM-5VQGJ3Z8.
const ETIQUETA_WHATSAPP = "g2ljCOHE7eMcEPzh5qNE";
const ETIQUETA_FORMULARIO = "2TWlCJ795OMcEPzh5qNE";
const CUENTA_ADS = "18328695036";

const MOVIL = {
  viewport: { width: 412, height: 823 },
  deviceScaleFactor: 2.625,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
};

async function abrirPestaña(navegador, opciones = {}) {
  const contexto = await navegador.newContext({ ...MOVIL, ...opciones });
  const pagina = await contexto.newPage();
  const registro = { gtm: [], ads: [], conversion: [], errores: [], interceptado: [] };
  const t0 = Date.now();

  pagina.on("console", (m) => { if (m.type() === "error") registro.errores.push(m.text().slice(0, 120)); });
  pagina.on("pageerror", (e) => registro.errores.push("pageerror: " + String(e).slice(0, 120)));
  pagina.on("request", (r) => {
    const url = r.url();
    const ms = Date.now() - t0;
    if (url.includes("googletagmanager.com/gtm.js")) registro.gtm.push({ ms, url });
    if (/googleads\.g\.doubleclick\.net|google\.com\/(ccm|pagead)|googleadservices|doubleclick\.net\/ccm/.test(url)) {
      registro.ads.push({ ms, url });
      if (url.includes(ETIQUETA_WHATSAPP) || url.includes(ETIQUETA_FORMULARIO)) {
        registro.conversion.push({ ms, etiqueta: url.includes(ETIQUETA_WHATSAPP) ? "whatsapp" : "formulario", url });
      }
    }
  });

  // La navegación a WhatsApp se responde con una página mínima: el documento
  // original muere exactamente igual que en la realidad, sin abrir ningún chat.
  await contexto.route(/wa\.me|api\.whatsapp\.com|whatsapp\.com\/send/i, (r) => {
    registro.interceptado.push({ ms: Date.now() - t0, tipo: "whatsapp" });
    r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>WhatsApp (relleno de prueba)</title>" });
  });
  await contexto.route(/\/api\/quotations/i, (r) => {
    registro.interceptado.push({ ms: Date.now() - t0, tipo: "quotations:" + r.request().method() });
    r.fulfill({ status: 200, contentType: "application/json", body: '{"id":0,"simulado":true}' });
  });

  return { contexto, pagina, registro };
}

const estado = (pagina) =>
  pagina.evaluate(() => ({
    dataLayer: Array.isArray(window.dataLayer),
    entradas: (window.dataLayer || []).length,
    eventos: (window.dataLayer || []).map((e) => e && e.event).filter(Boolean),
    cargado: !!(window.google_tag_manager && window.google_tag_manager["GTM-5VQGJ3Z8"]),
    contenedores: window.google_tag_manager
      ? Object.keys(window.google_tag_manager).filter((k) => /^(GTM|AW)-/.test(k))
      : [],
    clicsWhatsapp: (window.dataLayer || [])
      .filter((e) => e && e.event === "whatsapp_click")
      .map((e) => ({ procesadoPorGtm: e["gtm.uniqueEventId"] !== undefined, id: e["gtm.uniqueEventId"] })),
  }));

// ---------------------------------------------------------------------------
// A. Evento encolado antes de que exista el contenedor
// ---------------------------------------------------------------------------
async function pruebaCola(navegador) {
  const { contexto, pagina, registro } = await abrirPestaña(navegador);
  await pagina.goto(BASE + "/sonido", { waitUntil: "domcontentloaded", timeout: 90000 });

  // Se cancela la navegación del enlace para poder seguir observando la misma
  // página. El manejador de app.js corre igual: preventDefault no detiene la
  // propagación del evento.
  await pagina.evaluate(() => {
    document.addEventListener("click", (e) => { const a = e.target.closest && e.target.closest("a"); if (a) e.preventDefault(); }, true);
  });

  await pagina.waitForTimeout(900);
  const alInicio = await estado(pagina);

  const clic = await pagina.evaluate(() => {
    const enlace = [...document.querySelectorAll("a[href]")].find((a) =>
      /wa\.me|api\.whatsapp\.com|whatsapp\.com\/send/i.test(a.getAttribute("href") || "")
    );
    if (!enlace) return { encontrado: false };
    const antes = (window.dataLayer || []).filter((e) => e && e.event === "whatsapp_click").length;
    enlace.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    return {
      encontrado: true, antes,
      despues: (window.dataLayer || []).filter((e) => e && e.event === "whatsapp_click").length,
      texto: (enlace.textContent || "").trim().slice(0, 30),
      contenedorEnEseMomento: !!(window.google_tag_manager && window.google_tag_manager["GTM-5VQGJ3Z8"]),
    };
  });

  await pagina.waitForTimeout(7000);
  const alFinal = await estado(pagina);
  await contexto.close();
  return { alInicio, clic, alFinal, registro };
}

// ---------------------------------------------------------------------------
// B. Toque real en un CTA que navega en la misma pestaña
// ---------------------------------------------------------------------------
async function pruebaNavegacionReal(navegador, esperaAntesDelToque) {
  const { contexto, pagina, registro } = await abrirPestaña(navegador);
  await pagina.goto(BASE + "/sonido", { waitUntil: "domcontentloaded", timeout: 90000 });
  await pagina.waitForTimeout(esperaAntesDelToque);

  const antes = await estado(pagina).catch(() => null);

  // Toque real sobre el CTA del hero: genera pointerdown, y por tanto también
  // dispara la señal de interacción de la variante diferida.
  const caja = await pagina.evaluate(() => {
    const a = [...document.querySelectorAll("a[href]")].find((x) =>
      /wa\.me|api\.whatsapp\.com|whatsapp\.com\/send/i.test(x.getAttribute("href") || "")
    );
    if (!a) return null;
    const r = a.getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  });
  if (caja) await pagina.touchscreen.tap(caja.x, caja.y);

  // Se deja correr para ver si algo sale después de que el documento muere.
  await pagina.waitForTimeout(6000);
  const urlFinal = pagina.url();
  await contexto.close();
  return { esperaAntesDelToque, antes, urlFinal, registro };
}

// ---------------------------------------------------------------------------
// C. Interacción adelanta la carga
// ---------------------------------------------------------------------------
async function pruebaInteraccion(navegador) {
  const { contexto, pagina, registro } = await abrirPestaña(navegador);
  await pagina.goto(BASE + "/sonido", { waitUntil: "domcontentloaded", timeout: 90000 });
  await pagina.waitForTimeout(700);
  const antesDeTocar = await estado(pagina);
  await pagina.touchscreen.tap(206, 700); // zona sin enlaces
  await pagina.waitForTimeout(2000);
  const despues = await estado(pagina);
  await contexto.close();
  return { antesDeTocar, despues, registro };
}

// ---------------------------------------------------------------------------
// D. Formulario de la home
// ---------------------------------------------------------------------------
async function pruebaFormulario(navegador) {
  const { contexto, pagina, registro } = await abrirPestaña(navegador, {
    viewport: { width: 1350, height: 940 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  });
  await pagina.goto(BASE + "/", { waitUntil: "load", timeout: 90000 });
  await pagina.waitForTimeout(5000);
  const adsAntes = registro.ads.length;

  await pagina.evaluate(() => {
    document.querySelector("#customer_name").value = "Prueba de auditoria";
    document.querySelector("#email").value = "prueba@example.com";
    document.querySelector("#phone").value = "3000000000";
    document.querySelector("#quotationForm").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await pagina.waitForTimeout(4000);
  const final = await estado(pagina);
  await contexto.close();
  return { final, adsAntes, registro };
}

// ---------------------------------------------------------------------------

(async () => {
  const navegador = await chromium.launch();
  console.log(`\n################  RAMA: ${RAMA}  —  ${BASE}  ################`);

  const a = await pruebaCola(navegador);
  console.log(`\n=== A. Evento encolado antes de que exista el contenedor (sin navegar)`);
  console.log(`   a los 900 ms: dataLayer=${a.alInicio.dataLayer} entradas=${a.alInicio.entradas} contenedor=${a.alInicio.cargado}`);
  console.log(`   clic sobre "${a.clic.texto}": eventos ${a.clic.antes} -> ${a.clic.despues}, contenedor en ese instante=${a.clic.contenedorEnEseMomento}`);
  console.log(`   a los 8 s: contenedor=${a.alFinal.cargado} [${a.alFinal.contenedores.join(", ")}]`);
  console.log(`   gtm.js pedido a: ${a.registro.gtm.map((g) => g.ms + " ms").join(", ") || "nunca"}`);
  console.log(`   clic procesado por GTM: ${JSON.stringify(a.alFinal.clicsWhatsapp)}`);
  console.log(`   conversiones enviadas: ${a.registro.conversion.length ? a.registro.conversion.map((c) => c.etiqueta + " @" + c.ms + "ms").join(", ") : "NINGUNA"}`);
  console.log(`   peticiones a Google Ads: ${a.registro.ads.length} (cuenta ${CUENTA_ADS}: ${a.registro.ads.filter((x) => x.url.includes(CUENTA_ADS)).length})`);
  console.log(`   errores: ${a.registro.errores.length ? JSON.stringify(a.registro.errores) : "ninguno"}`);

  for (const espera of [1200, 5000]) {
    const b = await pruebaNavegacionReal(navegador, espera);
    console.log(`\n=== B. Toque real en el CTA a los ${espera} ms (navega en la misma pestaña)`);
    console.log(`   contenedor antes del toque: ${b.antes ? b.antes.cargado : "no medible"}`);
    console.log(`   gtm.js pedido a: ${b.registro.gtm.map((g) => g.ms + " ms").join(", ") || "nunca"}`);
    console.log(`   navegación a WhatsApp a: ${b.registro.interceptado.filter((i) => i.tipo === "whatsapp").map((i) => i.ms + " ms").join(", ") || "no ocurrió"}`);
    console.log(`   conversiones enviadas: ${b.registro.conversion.length ? b.registro.conversion.map((c) => c.etiqueta + " @" + c.ms + "ms").join(", ") : "NINGUNA"}`);
    console.log(`   peticiones a Google Ads: ${b.registro.ads.length} | URL final: ${b.urlFinal.slice(0, 60)}`);
  }

  const c = await pruebaInteraccion(navegador);
  console.log(`\n=== C. Interacción real (toque en zona vacía)`);
  console.log(`   antes de tocar, a los 700 ms: contenedor=${c.antesDeTocar.cargado}`);
  console.log(`   2 s después del toque: contenedor=${c.despues.cargado}`);
  console.log(`   gtm.js pedido a: ${c.registro.gtm.map((g) => g.ms + " ms").join(", ") || "nunca"}`);

  const d = await pruebaFormulario(navegador);
  console.log(`\n=== D. Formulario de la home`);
  console.log(`   eventos en dataLayer: ${d.final.eventos.join(", ")}`);
  console.log(`   ¿hay gtm.formSubmit?: ${d.final.eventos.includes("gtm.formSubmit")}`);
  console.log(`   peticiones a Google Ads: ${d.adsAntes} -> ${d.registro.ads.length}`);
  console.log(`   conversión de formulario: ${d.registro.conversion.filter((x) => x.etiqueta === "formulario").length ? "SÍ" : "no detectada"}`);
  console.log(`   interceptado: ${d.registro.interceptado.map((i) => i.tipo).join(", ") || "nada"}`);
  console.log(`   errores: ${d.registro.errores.length ? JSON.stringify(d.registro.errores) : "ninguno"}`);

  await navegador.close();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
