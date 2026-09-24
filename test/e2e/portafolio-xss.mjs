/**
 * Regresión del hotfix de seguridad (2026-09-24): el portafolio de la home no
 * ejecuta nada que venga en los campos de un evento, y escapeHtml() escapa
 * comillas dentro de atributos.
 *
 * Es hermética: sirve public/ desde el disco bajo un origen ficticio, responde
 * /api/* con datos de prueba (eventos maliciosos y legítimos) y aborta toda
 * petición a terceros (GTM, fuentes, Unsplash). No necesita wrangler dev ni
 * toca D1, KV o R2.
 *
 *   node test/e2e/portafolio-xss.mjs                 # contra public/js/app.js
 *   node test/e2e/portafolio-xss.mjs <ruta/app.js>   # contra otra versión
 */
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(import.meta.url)(
  "C:/Users/USUARIO/dev/tools/playwright/node_modules/playwright"
);

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public");
const APP_JS = process.argv[2] ? path.resolve(process.argv[2]) : path.join(PUBLIC_DIR, "js/app.js");
const ORIGIN = "https://straton.test";
const FALLBACK = "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&q=80";

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

// PNG de 1x1 para cualquier /api/media/*: las imágenes legítimas cargan.
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64"
);

// Cada payload, si llegara a ejecutarse, deja una marca en window.__xss.
const MARK = "window.__xss=(window.__xss||0)+1";
const XSS_TITLE = `"><img src=x onerror="${MARK}">`;

const EVENTS = [
  // Legítimo, tal como está hoy en producción.
  {
    id: 8, title: "Descargar Portafolio", event_type: "corporativo", status: "published",
    link: "https://canva.link/0dm01v7opb86bps",
    gallery_json: '["/api/media/products/9fabf1d2-beb8-4abd-b03a-9bed5febe839.webp"]',
    before_media_url: null, after_media_url: null, solution: null, result: null,
  },
  // Legítimo con comparador Antes/Después.
  {
    id: 2, title: "Evento Neodent", event_type: "corporativo", status: "published", link: null,
    gallery_json: '["/api/media/products/76586a03-8127-4918-8747-7a3f15e519e9.webp"]',
    before_media_url: "/api/media/events/antes.webp", after_media_url: "/api/media/events/despues.webp",
    solution: "Line array & monitores", result: 'Cliente "feliz"',
  },
  // Payload en todos los campos de texto y de URL.
  {
    id: 99, title: XSS_TITLE, event_type: `social"><img src=x onerror="${MARK}">`, status: "published",
    link: `javascript:${MARK}`,
    gallery_json: JSON.stringify([`x" onerror="${MARK}`]),
    before_media_url: `x" onerror="${MARK}`, after_media_url: `javascript:${MARK}`,
    solution: `<script>${MARK}</script>`, result: `<img src=x onerror="${MARK}">`,
  },
  // Comparador válido con textos maliciosos y enlace con tabulador.
  {
    id: 100, title: "<b>negrita</b>", event_type: "concierto", status: "published",
    link: `java\tscript:${MARK}`, gallery_json: "no-es-json",
    before_media_url: "/api/media/events/a.webp", after_media_url: "/api/media/events/b.webp",
    solution: `<img src=x onerror="${MARK}">`, result: `<svg onload="${MARK}">`,
  },
];

// Testimonio que rompería un atributo si escapeHtml no escapara comillas.
const TESTIMONIALS = [
  {
    id: 1, client_name: `Ana" onerror="${MARK}" data-x="`, company: null, quote: "Excelente servicio",
    avatar_url: "/avatar-roto.webp", visible: 1, status: "published",
  },
];

function apiResponse(url) {
  const { pathname } = url;
  if (pathname === "/api/events") return { status: 200, json: EVENTS };
  if (pathname === "/api/testimonials") return { status: 200, json: TESTIMONIALS };
  if (pathname === "/api/settings") return { status: 200, json: {} };
  if (pathname.startsWith("/api/pages/")) return { status: 404, json: { error: "Page not found" } };
  return { status: 200, json: [] };
}

const resultados = [];
function comprobar(nombre, ok, detalle = "") {
  resultados.push({ nombre, ok, detalle });
  console.log(`  ${ok ? "OK   " : "FALLA"}  ${nombre}${detalle ? "  ->  " + detalle : ""}`);
}

const navegador = await chromium.launch();
try {
  const contexto = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
  const pagina = await contexto.newPage();

  const dialogos = [];
  const errores = [];
  const inyectadas = [];
  pagina.on("dialog", (d) => {
    dialogos.push(d.message());
    d.dismiss().catch(() => {});
  });
  pagina.on("pageerror", (e) => errores.push(String(e).slice(0, 200)));
  pagina.on("request", (r) => {
    const u = new URL(r.url());
    // Una etiqueta inyectada con src=x pediría /x al origen.
    if (u.origin === ORIGIN && u.pathname === "/x") inyectadas.push(r.url());
  });

  await pagina.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.abort();
    if (url.pathname.startsWith("/api/media/")) {
      return route.fulfill({ status: 200, contentType: "image/png", body: PIXEL });
    }
    if (url.pathname.startsWith("/api/")) {
      const { status, json } = apiResponse(url);
      return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(json) });
    }
    const archivo = url.pathname === "/js/app.js"
      ? APP_JS
      : path.join(PUBLIC_DIR, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname));
    if (!archivo.startsWith(PUBLIC_DIR) && archivo !== APP_JS) return route.fulfill({ status: 404, body: "" });
    try {
      const body = await readFile(archivo);
      return route.fulfill({ status: 200, contentType: TYPES[path.extname(archivo)] || "application/octet-stream", body });
    } catch {
      return route.fulfill({ status: 404, body: "" });
    }
  });

  console.log(`Portafolio contra ${path.relative(process.cwd(), APP_JS) || APP_JS}\n`);
  await pagina.goto(ORIGIN + "/", { waitUntil: "domcontentloaded" });
  await pagina
    .waitForFunction(() => document.querySelectorAll("#eventsContainer .event-card").length >= 4, null, { timeout: 15000 })
    .catch(() => {});

  // Cargar todo lo diferido: bajar hasta el portafolio y los testimonios,
  // abrir los comparadores y dar tiempo a que falle cualquier imagen.
  await pagina.evaluate(() => {
    document.querySelector("#portafolio")?.scrollIntoView();
    document.querySelectorAll("details.event-comparator").forEach((d) => (d.open = true));
  });
  await pagina.waitForTimeout(600);
  await pagina.evaluate(() => document.querySelector("#testimonios")?.scrollIntoView());
  await pagina.waitForTimeout(1200);

  const dom = await pagina.evaluate(() => {
    const cont = document.querySelector("#eventsContainer");
    const tarjetas = [...cont.querySelectorAll("article.event-card")];
    const conOn = (raiz) =>
      [...raiz.querySelectorAll("*")].flatMap((el) =>
        [...el.attributes].filter((a) => /^on/i.test(a.name)).map((a) => `${el.tagName.toLowerCase()}[${a.name}]`)
      );
    return {
      xss: window.__xss,
      total: tarjetas.length,
      titulos: tarjetas.map((a) => a.querySelector(".event-card-title")?.textContent),
      tipos: tarjetas.map((a) => a.querySelector(".event-card-type")?.textContent),
      alts: tarjetas.map((a) => a.querySelector(".event-card-image")?.getAttribute("alt")),
      portadas: tarjetas.map((a) => a.querySelector(".event-card-image")?.getAttribute("src")),
      envoltorios: tarjetas.map((a) =>
        a.parentElement.tagName === "A"
          ? { href: a.parentElement.getAttribute("href"), target: a.parentElement.getAttribute("target"), rel: a.parentElement.getAttribute("rel") }
          : null
      ),
      comparadores: tarjetas.map((a) => {
        const d = a.querySelector("details.event-comparator");
        if (!d) return null;
        return {
          antes: d.querySelector(".event-before img")?.getAttribute("src"),
          despues: d.querySelector(".event-after img")?.getAttribute("src"),
          textos: [...d.querySelectorAll("p")].map((p) => p.textContent),
        };
      }),
      atributosOn: conOn(cont),
      etiquetasPeligrosas: [...cont.querySelectorAll("script, svg, b, iframe, object, embed")].map((e) => e.tagName.toLowerCase()),
      estilosFueraDelComparador: [...cont.querySelectorAll("style")].filter((s) => !s.closest("details.event-comparator")).length,
      testimonioOn: conOn(document.querySelector("#testimonialsContainer")),
      testimonioAlt: document.querySelector("#testimonialsContainer .testimonial-avatar")?.getAttribute("alt"),
      flotante: document.querySelector("a.whatsapp-float")?.getAttribute("target"),
    };
  });

  console.log("--- ejecución ---");
  comprobar("ningún payload se ejecutó (window.__xss)", dom.xss === undefined, `window.__xss=${dom.xss}`);
  comprobar("ningún diálogo", dialogos.length === 0, dialogos.join(" | "));
  comprobar("ninguna etiqueta inyectada pidió /x", inyectadas.length === 0, `${inyectadas.length} peticiones`);
  comprobar("app.js no lanzó excepciones", errores.length === 0, errores.join(" | "));

  console.log("--- estructura del portafolio ---");
  comprobar("se pintan las 4 tarjetas", dom.total === 4, `tarjetas=${dom.total}`);
  comprobar("ningún atributo on* dentro del portafolio", dom.atributosOn.length === 0, dom.atributosOn.join(", "));
  comprobar("ninguna etiqueta script/svg/b/iframe", dom.etiquetasPeligrosas.length === 0, dom.etiquetasPeligrosas.join(", "));
  comprobar("<style> solo el estático del comparador", dom.estilosFueraDelComparador === 0);

  console.log("--- los datos se ven como texto ---");
  comprobar("títulos literales", JSON.stringify(dom.titulos) === JSON.stringify(EVENTS.map((e) => e.title)), JSON.stringify(dom.titulos));
  comprobar("alt literal (título con comillas)", dom.alts[2] === XSS_TITLE, dom.alts[2]);
  comprobar("event_type desconocido se muestra como texto", dom.tipos[2] === EVENTS[2].event_type, dom.tipos[2]);
  comprobar(
    "textos del comparador literales",
    JSON.stringify(dom.comparadores[3]?.textos) === JSON.stringify([EVENTS[3].solution, EVENTS[3].result]),
    JSON.stringify(dom.comparadores[3]?.textos)
  );

  console.log("--- URLs validadas ---");
  comprobar("portada inválida cae en la imagen de reserva", dom.portadas[2] === FALLBACK && dom.portadas[3] === FALLBACK, `${dom.portadas[2]} | ${dom.portadas[3]}`);
  comprobar("sin comparador cuando antes/después no son imágenes propias", dom.comparadores[2] === null);
  comprobar("enlace javascript: no envuelve la tarjeta", dom.envoltorios[2] === null, JSON.stringify(dom.envoltorios[2]));
  comprobar("enlace java\\tscript: no envuelve la tarjeta", dom.envoltorios[3] === null, JSON.stringify(dom.envoltorios[3]));

  console.log("--- lo legítimo sigue igual ---");
  comprobar(
    "evento con enlace: <a> en pestaña nueva",
    dom.envoltorios[0]?.href === "https://canva.link/0dm01v7opb86bps" &&
      dom.envoltorios[0]?.target === "_blank" &&
      dom.envoltorios[0]?.rel === "noopener noreferrer",
    JSON.stringify(dom.envoltorios[0])
  );
  comprobar("portada legítima", dom.portadas[0] === "/api/media/products/9fabf1d2-beb8-4abd-b03a-9bed5febe839.webp", dom.portadas[0]);
  comprobar(
    "comparador legítimo: imágenes y textos",
    dom.comparadores[1]?.antes === "/api/media/events/antes.webp" &&
      dom.comparadores[1]?.despues === "/api/media/events/despues.webp" &&
      JSON.stringify(dom.comparadores[1]?.textos) === JSON.stringify(["Line array & monitores", 'Cliente "feliz"']),
    JSON.stringify(dom.comparadores[1])
  );
  comprobar("botón flotante de WhatsApp intacto", dom.flotante === "_blank", `target=${dom.flotante}`);

  console.log("--- escapeHtml en atributos (testimonios) ---");
  comprobar("el nombre con comillas no rompe el atributo alt", dom.testimonioOn.length === 0, dom.testimonioOn.join(", "));
  comprobar("alt del avatar literal", dom.testimonioAlt === TESTIMONIALS[0].client_name, dom.testimonioAlt);

  console.log("--- filtros ---");
  await pagina.click('.filter-btn[data-filter="corporativo"]');
  const corporativos = await pagina.$$eval("#eventsContainer article.event-card", (as) => as.map((a) => a.dataset.type));
  comprobar("filtro corporativo", JSON.stringify(corporativos) === JSON.stringify(["corporativo", "corporativo"]), JSON.stringify(corporativos));
  await pagina.click('.filter-btn[data-filter="all"]');
  await pagina.waitForTimeout(800);
  const todos = await pagina.$$eval("#eventsContainer article.event-card", (as) => as.length);
  const xssFinal = await pagina.evaluate(() => window.__xss);
  comprobar("volver a Todos repinta las 4 sin ejecutar nada", todos === 4 && xssFinal === undefined, `tarjetas=${todos} __xss=${xssFinal}`);

  await contexto.close();
} finally {
  await navegador.close();
}

const fallos = resultados.filter((r) => !r.ok);
console.log(`\n${resultados.length - fallos.length}/${resultados.length} comprobaciones correctas.`);
process.exit(fallos.length ? 1 : 0);
