/**
 * Cruce entre el bucket R2 y todo lo que el sitio referencia. SOLO LECTURA.
 *
 * Responde una sola pregunta: de los 149 objetos del bucket, ¿cuáles NO los
 * usa nadie? Para eso junta tres fuentes:
 *
 *   1. Todas las filas de todas las tablas de D1 en produccion, escaneando
 *      recursivamente cada valor de texto en busca de /api/media/.
 *   2. El codigo y los archivos estaticos del repo (public/, src/, audit/).
 *   3. El inventario del bucket (audit/tmp/r2-inventory.json).
 *
 * Un objeto se marca REFERENCIADO si alguna de las fuentes lo nombra. Todo lo
 * demas es huerfano. NO borra nada: solo imprime el analisis.
 *
 * Uso:  node audit/r2-orphans.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const DB = "straton-db";
const TABLES = ["events", "packages", "pages", "products", "quotations", "services", "testimonials"];
const TMP = path.join("audit", "tmp");
fs.mkdirSync(TMP, { recursive: true });

// ---------------------------------------------------------------- D1
function dumpTable(table) {
  const file = path.join(TMP, `prod-${table}.json`);
  if (fs.existsSync(file)) return;
  // Se arma como una sola cadena con comillas dobles alrededor del SQL porque
  // en Windows `shell: true` parte los argumentos por espacios (--command con
  // la consulta separada falla con "Unknown arguments: *, FROM, ...").
  const out = execSync(
    `npx wrangler d1 execute ${DB} --remote --json --command "SELECT * FROM ${table}"`,
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  fs.writeFileSync(file, out);
}

/** Recorre cualquier estructura y devuelve todos los strings de texto. */
function allStrings(value, acc = []) {
  if (typeof value === "string") acc.push(value);
  else if (Array.isArray(value)) for (const v of value) allStrings(v, acc);
  else if (value && typeof value === "object") for (const v of Object.values(value)) allStrings(v, acc);
  return acc;
}

const MEDIA_RE = /\/api\/media\/[A-Za-z0-9._/-]+/g;

/** url -> [{ tabla, columna, id }] */
const referenced = new Map();

function addRef(url, origen) {
  const clean = url.replace(/[",)\\]}+$/, "");
  if (!referenced.has(clean)) referenced.set(clean, []);
  referenced.get(clean).push(origen);
}

for (const table of TABLES) {
  dumpTable(table);
  const raw = fs.readFileSync(path.join(TMP, `prod-${table}.json`), "utf8");
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error(`  (no se pudo parsear ${table}, se omite)`);
    continue;
  }
  const rows = (parsed[0] && parsed[0].results) || [];
  for (const row of rows) {
    for (const [col, val] of Object.entries(row)) {
      for (const s of allStrings(val)) {
        for (const m of s.match(MEDIA_RE) || []) {
          addRef(m, `${table}.${col}#${row.id}`);
        }
      }
    }
  }
  console.log(`  ${table}: ${rows.length} filas`);
}

// -------------------------------------------------- repo (código y estáticos)
// Solo el código que el sitio realmente sirve. `audit/` queda fuera a
// propósito: esos scripts contienen listas de URLs copiadas de informes
// anteriores y marcarían como "referenciado" algo que ya nadie usa.
const REPO_DIRS = ["public", "src"];
const repoHits = new Map();
function scanDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "tmp" || entry.name === ".git") continue;
      scanDir(full);
    } else if (/\.(html|js|mjs|cjs|ts|css|json|jsonc|sql|md|txt)$/i.test(entry.name)) {
      const text = fs.readFileSync(full, "utf8");
      for (const m of text.match(MEDIA_RE) || []) {
        if (!repoHits.has(m)) repoHits.set(m, []);
        if (repoHits.get(m).length < 3) repoHits.get(m).push(full);
      }
    }
  }
}
for (const d of REPO_DIRS) scanDir(d);

// ---------------------------------------------------------------- bucket
const inventory = JSON.parse(fs.readFileSync(path.join(TMP, "r2-inventory.json"), "utf8"));

/** key de bucket -> url pública */
const URL_PREFIX = "/api/media/";
function keyToUrl(key) {
  return URL_PREFIX + key;
}

const NON_IMAGE = /\.(zip|sql|txt|json|gz|tar)$/i;
const IMAGE = /\.(webp|png|jpe?g|gif|avif|bmp|tiff|svg)$/i;

function fmt(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

const referencedKeys = [];
const orphanImages = [];
const orphanOther = [];

for (const obj of inventory) {
  const url = keyToUrl(obj.key);
  const isRefD1 = referenced.has(url);
  const isRefRepo = repoHits.has(url);

  // Una variante -640 / -1280 se considera referenciada si su base lo está:
  // el navegador solo la pide porque imgVariants() deriva la URL de la base.
  const variantMatch = obj.key.match(/^(.*)-(\d+)\.webp$/);
  let refViaBase = null;
  if (!isRefD1 && !isRefRepo && variantMatch) {
    const baseUrl = URL_PREFIX + variantMatch[1] + ".webp";
    if (referenced.has(baseUrl) || repoHits.has(baseUrl)) refViaBase = baseUrl;
  }

  const entry = { ...obj, url, refD1: isRefD1, refRepo: isRefRepo, refViaBase };

  if (isRefD1 || isRefRepo || refViaBase) referencedKeys.push(entry);
  else if (NON_IMAGE.test(obj.key)) orphanOther.push(entry);
  else if (IMAGE.test(obj.key)) orphanImages.push(entry);
  else orphanOther.push(entry);
}

// ---------------------------------------------------------------- informe
const referencedNonWebpExt = referencedKeys.filter((o) => IMAGE.test(o.key) && !/\.webp$/i.test(o.key));
const referencedNonWebpBytes = referencedKeys.filter(
  (o) => ((o.http_metadata && o.http_metadata.contentType) || "").startsWith("image/") &&
         (o.http_metadata.contentType !== "image/webp")
);

console.log("");
console.log("================ RESUMEN ================");
console.log(`Objetos en el bucket:            ${inventory.length}`);
console.log(`  referenciados (D1 o repo):     ${referencedKeys.length}`);
console.log(`  huerfanos que son imagen:      ${orphanImages.length}   ${fmt(orphanImages.reduce((a, o) => a + o.size, 0))}`);
console.log(`  huerfanos que NO son imagen:   ${orphanOther.length}   ${fmt(orphanOther.reduce((a, o) => a + o.size, 0))}`);
console.log("");
console.log(`URLs /api/media/ distintas referenciadas en D1: ${referenced.size}`);
console.log(`URLs /api/media/ vistas en el repo:             ${repoHits.size}`);
console.log("");

console.log("========== REFERENCIADAS CON CONTENT-TYPE NO-WEBP ==========");
console.log("(se sirven: NO se pueden borrar)");
for (const o of referencedNonWebpBytes.sort((a, b) => a.key.localeCompare(b.key))) {
  const ct = (o.http_metadata && o.http_metadata.contentType) || "-";
  console.log(`  ${fmt(o.size).padStart(10)}  ${ct.padEnd(11)}  ${o.url}`);
  const usos = referenced.get(o.url) || [];
  console.log(`              usado en: ${usos.slice(0, 4).join(", ") || "(repo)"}`);
}
console.log("");

console.log("========== REFERENCIADAS CON EXTENSIÓN NO .webp ==========");
for (const o of referencedNonWebpExt.sort((a, b) => a.key.localeCompare(b.key))) {
  const ct = (o.http_metadata && o.http_metadata.contentType) || "-";
  console.log(`  ${fmt(o.size).padStart(10)}  ${ct.padEnd(11)}  ${o.url}`);
}
console.log("");

const orphanWebp = orphanImages.filter((o) => /\.webp$/i.test(o.key));
const orphanNonWebp = orphanImages.filter((o) => !/\.webp$/i.test(o.key));

console.log("========== HUERFANAS: IMÁGENES QUE NO SON .webp ==========");
console.log("(candidatas a borrar — hoy nadie las referencia)");
let sum = 0;
for (const o of orphanNonWebp.sort((a, b) => a.key.localeCompare(b.key))) {
  const ct = (o.http_metadata && o.http_metadata.contentType) || "-";
  sum += o.size;
  console.log(`  ${fmt(o.size).padStart(10)}  ${ct.padEnd(11)}  ${o.url}`);
}
console.log(`  --- ${orphanNonWebp.length} objetos, ${fmt(sum)} ---`);
console.log("");

console.log("========== HUERFANAS: IMÁGENES .webp ==========");
console.log("(ya están en WebP; no las pide el pedido, se listan solo como dato)");
let sumW = 0;
for (const o of orphanWebp.sort((a, b) => a.key.localeCompare(b.key))) sumW += o.size;
console.log(`  --- ${orphanWebp.length} objetos, ${fmt(sumW)} ---`);
console.log("");

console.log("========== HUERFANOS: NO IMÁGENES (no tocar) ==========");
for (const o of orphanOther.sort((a, b) => a.key.localeCompare(b.key))) {
  console.log(`  ${fmt(o.size).padStart(10)}  ${o.key}`);
}
console.log("");

fs.writeFileSync(
  path.join(TMP, "r2-orphans.json"),
  JSON.stringify(
    {
      referenciados: referencedKeys.map((o) => o.url),
      huerfanosImagenNoWebp: orphanNonWebp.map((o) => ({ url: o.url, size: o.size })),
      huerfanosImagenWebp: orphanWebp.map((o) => ({ url: o.url, size: o.size })),
      huerfanosOtros: orphanOther.map((o) => ({ key: o.key, size: o.size })),
      usos: Object.fromEntries(referenced),
    },
    null,
    2
  )
);
console.log("Detalle en audit/tmp/r2-orphans.json");
