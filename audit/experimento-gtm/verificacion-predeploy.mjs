/**
 * Verificación pre-deploy del diferimiento de GTM y de los CTA en pestaña nueva.
 *
 * Se ejecuta contra `wrangler dev` (http://127.0.0.1:8787), es decir contra el
 * código que quedaría en producción. No toca producción ni crea datos: la
 * navegación a WhatsApp se responde con una página de relleno y los POST a
 * /api/quotations se interceptan, así que no se abre ningún chat ni se crea
 * ninguna cotización.
 *
 * AVISO: sí carga el contenedor real de GTM (GTM-5VQGJ3Z8) y deja salir sus
 * peticiones, así que genera tráfico y hits reales hacia Google (Tag Manager,
 * Analytics y conversiones de Google Ads) desde localhost. Para comprobar el
 * sitio sin tocar Google, usar las pruebas herméticas de test/.
 *
 * Comprueba, en /, /sonido y /pantallas-led:
 *   1. Consola limpia (sin errores de consola ni excepciones).
 *   2. dataLayer existe antes de que se pida gtm.js.
 *   3. Sin interacción, el contenedor no se pide antes de los 3 s.
 *   4. Con interacción temprana, el contenedor se adelanta.
 *   5. Nunca hay doble carga de gtm.js.
 *   6. H1 único, canonical y JSON-LD válidos.
 *   7. Los CTA de WhatsApp del hero y del bloque CTA abren en pestaña nueva.
 *   8. whatsapp_click llega al contenedor y sale la conversión de Google Ads.
 *   9. El formulario de la home sigue generando su conversión.
 *
 *   node audit/experimento-gtm/verificacion-predeploy.mjs [url-base]
 */
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(
  "C:/Users/USUARIO/dev/tools/playwright/node_modules/playwright"
);

const BASE = process.argv[2] || "http://127.0.0.1:8787";
const ORIGEN = new URL(BASE).origin;
const LOCAL = /127\.0\.0\.1|localhost/.test(ORIGEN);
const PAGINAS = ["/", "/sonido", "/pantallas-led"];

// El bucket R2 emulado por `wrangler dev` no tiene las variantes de imagen que
// sí existen en producción (verificado con HEAD: -640, -1280 y original
// responden 200). Esos 404 son del banco local, no del código, así que se
// anotan aparte en vez de contarse como consola sucia.
const RUIDO_LOCAL = /\/api\/media\/products\//;

// La home nunca ha llevado <link rel="canonical"> ni CTA de WhatsApp propios:
// su único enlace es el botón flotante. Es el estado previo a este cambio y
// queda fuera del alcance autorizado, así que se comprueba como tal.
const SIN_CANONICAL = new Set(["/"]);
const SIN_CTA_PROPIO = new Set(["/"]);

// Leídas del contenedor público GTM-5VQGJ3Z8.
const ETIQUETA_WHATSAPP = "g2ljCOHE7eMcEPzh5qNE";
const ETIQUETA_FORMULARIO = "2TWlCJ795OMcEPzh5qNE";
const CONTENEDOR = "GTM-5VQGJ3Z8";
const TEMPORIZADOR = 3000;

const MOVIL = {
  viewport: { width: 412, height: 823 },
  deviceScaleFactor: 2.625,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
};

const RE_ADS =
  /googleads\.g\.doubleclick\.net|google\.com\/(ccm|pagead)|googleadservices|doubleclick\.net\/ccm/;
const RE_WHATSAPP = /wa\.me|api\.whatsapp\.com|whatsapp\.com\/send/i;

const resultados = [];
function comprobar(grupo, nombre, ok, detalle = "") {
  resultados.push({ grupo, nombre, ok, detalle });
  console.log(`  ${ok ? "OK   " : "FALLA"}  ${nombre}${detalle ? "  ->  " + detalle : ""}`);
}

/**
 * La consola está limpia si no hay ninguna excepción ni ningún error de carga
 * que no explique un 404 del bucket local. Los errores se cuentan, no se
 * silencian: si aparece uno de más, la comprobación falla.
 */
function consola(reg) {
  const cargas = reg.errores.filter((e) => /Failed to load resource/.test(e));
  const otros = reg.errores.filter((e) => !/Failed to load resource/.test(e));
  const ok = otros.length === 0 && cargas.length <= reg.ruido.length;
  const nota = reg.ruido.length
    ? `sin errores propios; ${reg.ruido.length} imágenes ausentes solo en el R2 local: ${[...new Set(reg.ruido)].join(", ")}`
    : "sin errores";
  return { ok, detalle: otros.length ? otros.join(" | ") : nota };
}

async function abrirPestana(navegador) {
  const contexto = await navegador.newContext(MOVIL);
  const pagina = await contexto.newPage();
  const reg = {
    gtm: [], ads: [], conversion: [], errores: [], popups: [], interceptado: [], ruido: [],
  };
  const t0 = Date.now();

  const vigilar = (p) => {
    p.on("console", (m) => {
      if (m.type() === "error") reg.errores.push(m.text().slice(0, 160));
    });
    p.on("pageerror", (e) => reg.errores.push("excepción: " + String(e).slice(0, 160)));
    p.on("response", (r) => {
      if (r.status() >= 400 && LOCAL && RUIDO_LOCAL.test(r.url())) {
        reg.ruido.push(r.status() + " " + r.url().replace(ORIGEN, ""));
      }
    });
  };
  vigilar(pagina);
  contexto.on("page", (p) => {
    reg.popups.push({ ms: Date.now() - t0, url: p.url() });
    vigilar(p);
  });

  contexto.on("request", (r) => {
    const url = r.url();
    const ms = Date.now() - t0;
    if (url.includes("googletagmanager.com/gtm.js")) reg.gtm.push({ ms, url });
    if (RE_ADS.test(url)) {
      reg.ads.push({ ms, url });
      if (url.includes(ETIQUETA_WHATSAPP)) reg.conversion.push({ ms, etiqueta: "whatsapp" });
      if (url.includes(ETIQUETA_FORMULARIO)) reg.conversion.push({ ms, etiqueta: "formulario" });
    }
  });

  await contexto.route(RE_WHATSAPP, (r) => {
    reg.interceptado.push({ ms: Date.now() - t0, tipo: "whatsapp" });
    r.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>WhatsApp (relleno de prueba)</title>",
    });
  });
  await contexto.route(/\/api\/quotations/i, (r) => {
    reg.interceptado.push({ ms: Date.now() - t0, tipo: "quotations:" + r.request().method() });
    r.fulfill({ status: 200, contentType: "application/json", body: '{"id":0,"simulado":true}' });
  });

  return { contexto, pagina, reg, t0 };
}

/** Inventario de SEO y de enlaces de WhatsApp tal y como quedan en el DOM. */
const inventario = (pagina) =>
  pagina.evaluate(() => {
    const re = /wa\.me|api\.whatsapp\.com|whatsapp\.com\/send/i;
    const enlaces = [...document.querySelectorAll("a[href]")]
      .filter((a) => re.test(a.getAttribute("href") || ""))
      .map((a) => ({
        clase: a.className || "",
        target: a.getAttribute("target") || "",
        rel: a.getAttribute("rel") || "",
      }));
    const jsonld = [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => {
      try {
        const d = JSON.parse(s.textContent || "");
        const nodos = Array.isArray(d) ? d : d["@graph"] || [d];
        return nodos
          .map((x) => (Array.isArray(x["@type"]) ? x["@type"].join("/") : x["@type"] || "sin-tipo"))
          .join(", ");
      } catch (e) {
        return "JSON-INVALIDO";
      }
    });
    return {
      h1: [...document.querySelectorAll("h1")].map((h) => (h.textContent || "").trim()),
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") || "",
      titulo: document.title,
      jsonld,
      enlaces,
      contenedores: Object.keys(window.google_tag_manager || {}).filter((k) => k.startsWith("GTM-")),
    };
  });

async function sinInteraccion(navegador, ruta) {
  const { contexto, pagina, reg } = await abrirPestana(navegador);
  await pagina.goto(BASE + ruta, { waitUntil: "domcontentloaded", timeout: 60000 });

  // A los 300 ms el contenedor todavía no existe, pero la cola sí.
  await pagina.waitForTimeout(300);
  const temprano = await pagina.evaluate(() => ({
    hayDataLayer: Array.isArray(window.dataLayer),
    entradas: (window.dataLayer || []).length,
    primerEvento: (window.dataLayer || [])[0]?.event || null,
  }));
  const gtmA300 = reg.gtm.length;

  await pagina.waitForTimeout(4400); // margen holgado sobre el temporizador
  const inv = await inventario(pagina);

  await contexto.close();
  return { reg, temprano, gtmA300, inv };
}

async function conInteraccion(navegador, ruta) {
  const { contexto, pagina, reg } = await abrirPestana(navegador);
  await pagina.goto(BASE + ruta, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pagina.waitForTimeout(700);
  await pagina.touchscreen.tap(206, 40); // zona neutra de la cabecera
  await pagina.waitForTimeout(1200);
  const ms = reg.gtm.length ? reg.gtm[0].ms : null;
  await contexto.close();
  return { reg, ms };
}

/** Toque real sobre el primer CTA de WhatsApp visible, antes del temporizador. */
async function toqueCta(navegador, ruta, espera) {
  const { contexto, pagina, reg } = await abrirPestana(navegador);
  await pagina.goto(BASE + ruta, { waitUntil: "domcontentloaded", timeout: 60000 });
  await pagina.waitForTimeout(espera);

  const destino = await pagina.evaluate(() => {
    const re = /wa\.me|api\.whatsapp\.com|whatsapp\.com\/send/i;
    const a = [...document.querySelectorAll("a.btn-hero, a.btn-cta")].find((x) =>
      re.test(x.getAttribute("href") || "")
    );
    if (!a) return null;
    const c = a.getBoundingClientRect();
    return {
      x: Math.round(c.x + c.width / 2),
      y: Math.round(c.y + c.height / 2),
      alcanzable: c.top >= 0 && c.bottom <= innerHeight && c.width > 0,
      target: a.getAttribute("target") || "",
      clase: a.className || "",
    };
  });

  if (destino && destino.alcanzable) await pagina.touchscreen.tap(destino.x, destino.y);
  await pagina.waitForTimeout(4000);

  // La pestaña original debe seguir viva: esa es la razón de target="_blank".
  let sobrevive = false;
  let cola = [];
  let procesados = 0;
  try {
    const d = await pagina.evaluate(() => ({
      eventos: (window.dataLayer || []).map((e) => e && e.event).filter(Boolean),
      procesados: (window.dataLayer || []).filter(
        (e) => e && e["gtm.uniqueEventId"] !== undefined
      ).length,
    }));
    sobrevive = true;
    cola = d.eventos;
    procesados = d.procesados;
  } catch (e) {
    sobrevive = false;
  }

  await contexto.close();
  return { reg, destino, sobrevive, cola, procesados };
}

async function formulario(navegador) {
  const { contexto, pagina, reg } = await abrirPestana(navegador);
  await pagina.goto(BASE + "/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await pagina.waitForTimeout(TEMPORIZADOR + 800); // el contenedor ya cargó

  await pagina.fill("#customer_name", "Prueba Pre-Deploy");
  await pagina.fill("#email", "prueba@ejemplo.invalid");
  await pagina.fill("#phone", "3000000000");
  await pagina.fill("#city", "Bogotá");
  await pagina.click("#formSubmit");
  await pagina.waitForTimeout(4000);

  const eventos = await pagina.evaluate(() =>
    (window.dataLayer || []).map((e) => e && e.event).filter(Boolean)
  );
  await contexto.close();
  return { reg, eventos };
}

(async () => {
  const navegador = await chromium.launch();
  console.log(`Verificación pre-deploy contra ${BASE}`);
  console.log(
    `Contenedor ${CONTENEDOR}, temporizador ${TEMPORIZADOR} ms, perfil móvil 412x823 @2,625\n`
  );

  for (const ruta of PAGINAS) {
    console.log(`--- ${ruta} ---`);
    const s = await sinInteraccion(navegador, ruta);

    const c = consola(s.reg);
    comprobar(ruta, "consola limpia", c.ok, c.detalle);
    comprobar(
      ruta,
      "dataLayer existe antes del contenedor",
      s.temprano.hayDataLayer && s.temprano.primerEvento === "gtm.js" && s.gtmA300 === 0,
      `entradas=${s.temprano.entradas} primerEvento=${s.temprano.primerEvento} gtm.js@300ms=${s.gtmA300}`
    );
    // El temporizador cuenta desde que se ejecuta el script en línea, no desde
    // que se abre la pestaña, así que al instante medido hay que sumarle lo que
    // tardó la navegación. Se comprueba sobre la marca de tiempo registrada, no
    // con un muestreo de reloj de pared: contra producción la navegación tarda
    // más y ese muestreo caía después del plazo sin que nada fuera mal.
    comprobar(
      ruta,
      "sin interacción el contenedor nunca se pide antes de los 3 s",
      s.reg.gtm.length === 1 && s.reg.gtm[0].ms >= TEMPORIZADOR,
      s.reg.gtm.length ? `gtm.js a ${s.reg.gtm[0].ms} ms` : "nunca cargó"
    );
    comprobar(
      ruta,
      "el contenedor carga al vencer el temporizador",
      s.reg.gtm.length === 1 && s.reg.gtm[0].ms < TEMPORIZADOR + 1500,
      s.reg.gtm.map((g) => g.ms + " ms").join(", ") || "nunca cargó"
    );
    comprobar(ruta, "sin doble carga de gtm.js", s.reg.gtm.length === 1, `peticiones=${s.reg.gtm.length}`);
    comprobar(
      ruta,
      "un solo contenedor activo",
      s.inv.contenedores.length === 1 && s.inv.contenedores[0] === CONTENEDOR,
      s.inv.contenedores.join(", ") || "ninguno"
    );
    comprobar(ruta, "H1 único", s.inv.h1.length === 1, `${s.inv.h1.length}: ${s.inv.h1.join(" | ").slice(0, 90)}`);
    comprobar(
      ruta,
      SIN_CANONICAL.has(ruta) ? "canonical: la home sigue sin él, como antes" : "canonical apunta a la propia URL",
      SIN_CANONICAL.has(ruta) ? s.inv.canonical === "" : s.inv.canonical === ORIGEN + ruta,
      s.inv.canonical || "(ninguno)"
    );
    comprobar(ruta, "JSON-LD válido", s.inv.jsonld.length > 0 && !s.inv.jsonld.includes("JSON-INVALIDO"),
      s.inv.jsonld.join(", "));

    const visibles = s.inv.enlaces.filter((e) => /btn-hero|btn-cta/.test(e.clase));
    const flotante = s.inv.enlaces.find((e) => /whatsapp-float/.test(e.clase));
    comprobar(
      ruta,
      SIN_CTA_PROPIO.has(ruta)
        ? "la home no tiene CTA de bloque, solo el flotante"
        : "CTA de hero y CTA abren en pestaña nueva",
      SIN_CTA_PROPIO.has(ruta)
        ? visibles.length === 0
        : visibles.length > 0 && visibles.every((e) => e.target === "_blank" && /noopener/.test(e.rel)),
      visibles.length ? visibles.map((e) => `${e.clase.trim()}[${e.target}]`).join(", ") : "sin CTA de bloque"
    );
    comprobar(ruta, "botón flotante intacto", !!flotante && flotante.target === "_blank",
      flotante ? `target=${flotante.target}` : "no encontrado");

    const i = await conInteraccion(navegador, ruta);
    comprobar(ruta, "una interacción adelanta la carga del contenedor", i.ms !== null && i.ms < TEMPORIZADOR,
      i.ms === null ? "no cargó" : `gtm.js a ${i.ms} ms`);
    comprobar(ruta, "sin doble carga tras la interacción", i.reg.gtm.length === 1, `peticiones=${i.reg.gtm.length}`);
  }

  for (const ruta of ["/sonido", "/pantallas-led"]) {
    console.log(`--- conversión de WhatsApp en ${ruta} (toque a 800 ms, antes del temporizador) ---`);
    const t = await toqueCta(navegador, ruta, 800);
    comprobar(ruta, "el CTA era alcanzable", !!(t.destino && t.destino.alcanzable),
      t.destino ? `${t.destino.clase.trim()} target=${t.destino.target}` : "no encontrado");
    comprobar(ruta, "abre pestaña nueva y la original sobrevive", t.sobrevive && t.reg.popups.length >= 1,
      `popups=${t.reg.popups.length} original viva=${t.sobrevive}`);
    comprobar(ruta, "whatsapp_click llega al dataLayer", t.cola.includes("whatsapp_click"), t.cola.join(", "));
    comprobar(ruta, "el toque adelanta el contenedor", t.reg.gtm.length === 1 && t.reg.gtm[0].ms < TEMPORIZADOR,
      t.reg.gtm.map((g) => g.ms + " ms").join(", ") || "no cargó");
    comprobar(ruta, "GTM procesa los eventos en cola", t.procesados > 0,
      `eventos con gtm.uniqueEventId = ${t.procesados}`);
    comprobar(ruta, "sale la conversión de Google Ads", t.reg.conversion.some((c) => c.etiqueta === "whatsapp"),
      t.reg.conversion.map((c) => `${c.etiqueta}@${c.ms}ms`).join(", ") || "ninguna");
    comprobar(ruta, "no se abrió ningún chat real", t.reg.interceptado.some((x) => x.tipo === "whatsapp"),
      t.reg.interceptado.map((x) => x.tipo).join(", "));
  }

  console.log("--- formulario de la home ---");
  const f = await formulario(navegador);
  comprobar("/", "el formulario dispara su evento", f.eventos.some((e) => /form/i.test(e)), f.eventos.join(", "));
  comprobar("/", "sale la conversión del formulario", f.reg.conversion.some((c) => c.etiqueta === "formulario"),
    f.reg.conversion.map((c) => `${c.etiqueta}@${c.ms}ms`).join(", ") || "ninguna");
  comprobar("/", "no se creó ninguna cotización", f.reg.interceptado.some((x) => x.tipo.startsWith("quotations:POST")),
    f.reg.interceptado.map((x) => x.tipo).join(", ") || "sin POST");
  const cf = consola(f.reg);
  comprobar("/", "consola limpia durante el envío", cf.ok, cf.detalle);

  await navegador.close();

  const fallos = resultados.filter((r) => !r.ok);
  console.log(`\n${resultados.length - fallos.length}/${resultados.length} comprobaciones correctas.`);
  if (fallos.length) {
    console.log("\nFallos:");
    for (const x of fallos) console.log(`  ${x.grupo}  ${x.nombre}  ->  ${x.detalle}`);
    process.exit(1);
  }
  console.log("Todo correcto.");
})().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
