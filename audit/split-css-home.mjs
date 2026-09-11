/**
 * Separa de styles.css las reglas que solo puede usar la home.
 *
 * Las páginas dinámicas comparten el mismo shell que la landing, así que hoy
 * descargan y parsean el CSS completo —nav y footer aparte, cuatro quintas
 * partes no llegan a aplicar nunca—. Este script decide qué reglas quedan en el
 * archivo compartido y cuáles pasan a home.css comprobando, contra el DOM real
 * de /sonido y /pantallas-led, si el selector puede llegar a coincidir.
 *
 * Para no romper estados que solo existen tras una interacción, antes de
 * comprobar un selector se le quitan las pseudoclases (:hover, :focus…) y las
 * clases de estado (.open, .expanded, .scrolled…): lo que se prueba es el
 * elemento base. Si ese elemento existe en una página dinámica, la regla se
 * queda, aunque su estado no se haya dado durante la comprobación.
 *
 * Uso:
 *   node audit/split-css-home.mjs analizar <base-url>   → informe, no escribe
 *   node audit/split-css-home.mjs aplicar  <base-url>   → escribe los archivos
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const { chromium } = createRequire(import.meta.url)(
  "C:/Users/USUARIO/dev/tools/playwright/node_modules/playwright"
);

const MODE = process.argv[2] || "analizar";
const BASE = process.argv[3] || "https://stratonaudio.com.co";
const CSS_PATH = "public/css/styles.css";
const OUT_SHARED = "public/css/core.css";
const OUT_HOME = "audit/tmp/home-only.css"; // solo para revisar el recorte
const DYNAMIC_ROUTES = ["/sonido", "/pantallas-led"];

// Selectores que nunca se mueven: cimientos del documento y piezas que el
// renderizador de bloques puede crear en cualquier momento.
const ALWAYS_SHARED = /^(:root|\*|html|body|@font-face|@keyframes)/;
const SHARED_HINTS = /(^|[\s,>~+])(\.dynamic-|\.block-|\.hero-bg-sticky|\.whatsapp-float|\.anim-idle|\.faq-|\.pc-|\.toc-|\.spacer-|\.empty-|\.nav|\.footer|\.container|\.btn|\.sr-only|\.section\b)/;

/** Clases que el renderizador de bloques puede emitir. Se leen del propio
 *  código —cliente y servidor— en vez de mantener una lista a mano: cualquier
 *  bloque que un admin añada mañana a una página (formulario de contacto,
 *  galería, paquetes…) debe encontrar sus estilos en el archivo compartido,
 *  aunque hoy ninguna página publicada lo use. */
function rendererClasses() {
  const sources = ["public/js/app.js", "src/index.ts"];
  const classes = new Set();
  for (const file of sources) {
    const code = readFileSync(file, "utf8");
    const patterns = [
      /class="([^"${}]+)"/g,
      /className\s*=\s*['"]([^'"${}]+)['"]/g,
      /classList\.(?:add|toggle|remove)\(\s*['"]([^'"]+)['"]/g,
      /sectionWrapper\(\s*['"]([a-z-]+)['"]/g,
    ];
    for (const re of patterns) {
      let m;
      while ((m = re.exec(code))) {
        for (const token of m[1].split(/\s+/)) if (token) classes.add(token);
      }
    }
  }
  // sectionWrapper('cards') produce class="dynamic-block block-cards".
  for (const c of [...classes]) classes.add("block-" + c);
  return classes;
}

const RENDERER_CLASSES = rendererClasses();

/** Un selector sin clase ni id (p. ej. `input, textarea, select`) es una base
 *  del documento: se queda siempre. */
function isBareElementSelector(sel) {
  return !/[.#]/.test(sel);
}

function usesRendererClass(sel) {
  const classes = sel.match(/\.[A-Za-z0-9_-]+/g) || [];
  return classes.some((c) => RENDERER_CLASSES.has(c.slice(1)));
}

// Clases que representan un estado momentáneo; se retiran antes de comprobar.
const STATE_CLASSES = [
  "open", "active", "visible", "expanded", "scrolled", "hidden", "has-expanded",
  "anim-idle", "featured", "was-auto-expanded", "faq-visible", "faq-animate-in",
  "success", "error", "loading", "animate", "show", "selected", "disabled",
  "has-cart-bar", "is-open", "collapsed", "toc-collapsed", "highlight",
];

/** Reduce un selector a los elementos base que puede tocar. */
function toProbe(selector) {
  let s = selector
    .replace(/::[a-z-]+(\([^)]*\))?/gi, "")
    .replace(/:(hover|focus|focus-visible|focus-within|active|disabled|checked|visited|target|placeholder-shown|autofill|-webkit-[a-z-]+|-moz-[a-z-]+)/gi, "");
  for (const cls of STATE_CLASSES) {
    s = s.replace(new RegExp("\\." + cls + "(?![\\w-])", "g"), "");
  }
  // Un selector que se queda sin nada tras la limpieza (p. ej. "::selection")
  // se considera compartido: no hay forma de probarlo.
  return s.trim();
}

/** Trocea el CSS en bloques de nivel superior conservando comentarios previos. */
function splitBlocks(css) {
  const blocks = [];
  let depth = 0, start = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        blocks.push(css.slice(start, i + 1));
        start = i + 1;
      }
    }
  }
  if (start < css.length) blocks.push(css.slice(start));
  return blocks;
}

function preludeOf(block) {
  const i = block.indexOf("{");
  return (i === -1 ? block : block.slice(0, i))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();
}

const css = readFileSync(CSS_PATH, "utf8");
const topBlocks = splitBlocks(css);

// Cada unidad es una regla clasificable: las de nivel superior y, dentro de
// cada @media, sus reglas internas.
const units = [];
for (let b = 0; b < topBlocks.length; b++) {
  const block = topBlocks[b];
  const prelude = preludeOf(block);
  if (!prelude) { units.push({ kind: "raw", block, index: b }); continue; }
  if (prelude.startsWith("@media")) {
    const open = block.indexOf("{");
    const inner = block.slice(open + 1, block.lastIndexOf("}"));
    const innerBlocks = splitBlocks(inner);
    units.push({ kind: "media", index: b, prelude: block.slice(0, open + 1), inner: innerBlocks, tail: "\n}\n" });
  } else {
    units.push({ kind: "rule", index: b, block, prelude });
  }
}

// Todos los selectores que hay que probar.
const probes = new Map();
function preludeIsShared(prelude) {
  if (ALWAYS_SHARED.test(prelude) || SHARED_HINTS.test(prelude)) return true;
  return prelude.split(",").some((sel) => isBareElementSelector(sel) || usesRendererClass(sel));
}

function addProbes(prelude) {
  if (preludeIsShared(prelude)) return;
  for (const sel of prelude.split(",")) {
    const p = toProbe(sel);
    if (p) probes.set(p, false);
  }
}
for (const u of units) {
  if (u.kind === "rule") addProbes(u.prelude);
  else if (u.kind === "media") for (const ib of u.inner) { const p = preludeOf(ib); if (p) addProbes(p); }
}

const probeList = [...probes.keys()];
console.log(`selectores a comprobar: ${probeList.length}`);

const browser = await chromium.launch();
const matched = new Set();
for (const route of DYNAMIC_ROUTES) {
  for (const vp of [{ width: 412, height: 823, isMobile: true }, { width: 1350, height: 940, isMobile: false }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.isMobile, deviceScaleFactor: vp.isMobile ? 2.625 : 1 });
    const page = await ctx.newPage();
    await page.goto(BASE + route, { waitUntil: "load", timeout: 90000 });
    await page.waitForTimeout(3500);
    const hits = await page.evaluate((list) => {
      const out = [];
      for (const sel of list) {
        try { if (document.querySelector(sel)) out.push(sel); } catch (e) { out.push(sel); /* selector raro: se conserva */ }
      }
      return out;
    }, probeList);
    hits.forEach((h) => matched.add(h));
    console.log(`  ${route} @${vp.isMobile ? "móvil" : "escritorio"}: ${hits.length} selectores con coincidencia`);
    await ctx.close();
  }
}
await browser.close();

function isShared(prelude) {
  if (preludeIsShared(prelude)) return true;
  return prelude.split(",").some((sel) => {
    const p = toProbe(sel);
    return !p || matched.has(p);
  });
}

const sharedOut = [];
const homeOut = [];
const movedPreludes = [];

for (const u of units) {
  if (u.kind === "raw") { sharedOut.push(u.block); continue; }
  if (u.kind === "rule") {
    if (isShared(u.prelude)) sharedOut.push(u.block);
    else { homeOut.push(u.block); movedPreludes.push(u.prelude); }
    continue;
  }
  // @media: se reparten las reglas internas y se reconstruye el envoltorio.
  const keep = [], move = [];
  for (const ib of u.inner) {
    const p = preludeOf(ib);
    if (!p) { keep.push(ib); continue; }
    if (isShared(p)) keep.push(ib);
    else { move.push(ib); movedPreludes.push(`@media ⟶ ${p}`); }
  }
  if (keep.some((k) => preludeOf(k))) sharedOut.push(u.prelude + keep.join("") + u.tail);
  if (move.length) homeOut.push(u.prelude + move.join("") + u.tail);
}

const sharedCss = sharedOut.join("");
const homeCss =
  `/* ====================================================================\n` +
  `   home.css — reglas que solo usa la landing (/).\n\n` +
  `   Se separaron de styles.css porque las páginas dinámicas comparten el\n` +
  `   mismo shell y las descargaban sin poder aplicarlas nunca. El Worker\n` +
  `   retira el <link> a este archivo cuando sirve una página dinámica.\n` +
  `   Generado con audit/split-css-home.mjs.\n` +
  `   ==================================================================== */\n` +
  homeOut.join("");

console.log(`\nreglas movidas a home.css: ${movedPreludes.length}`);
console.log(`styles.css: ${css.length} B -> ${sharedCss.length} B`);
console.log(`home.css:   ${homeCss.length} B`);
console.log(`\nprimeras 60 reglas movidas:`);
movedPreludes.slice(0, 60).forEach((p) => console.log("   " + p.replace(/\s+/g, " ").slice(0, 100)));
if (movedPreludes.length > 60) console.log(`   … y ${movedPreludes.length - 60} más`);

if (MODE === "aplicar") {
  writeFileSync(OUT_HOME, homeCss);
  writeFileSync(OUT_SHARED, sharedCss);
  console.log("\nEscrito public/css/core.css (styles.css queda intacto)");
} else {
  console.log("\n(modo análisis: no se escribió nada)");
}
