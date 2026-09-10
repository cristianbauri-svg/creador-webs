/**
 * Inventario COMPLETO del bucket R2 straton-bucket (solo lectura).
 *
 * Por qué existe: `wrangler r2 object` solo tiene get/put/delete por ruta
 * exacta, no hay comando de listado. Pero la API REST de Cloudflare SÍ expone
 *   GET /accounts/{acct}/r2/buckets/{bucket}/objects?per_page=N&cursor=...
 * y wrangler ya está autenticado por OAuth, así que reutilizamos ese token
 * (se lee del config, nunca se imprime) para enumerar el bucket.
 *
 * No modifica nada. Escribe el inventario crudo en audit/tmp/r2-inventory.json
 * y resume por extensión, por content-type y los objetos de imagen que NO son
 * WebP.
 *
 * Uso:  node audit/r2-inventory.mjs
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const ACCOUNT = "c2ced5333d7e4758d6fe9580def1bf41";
const BUCKET = "straton-bucket";

const CONFIG_CANDIDATES = [
  path.join(os.homedir(), "AppData", "Roaming", "xdg.config", ".wrangler", "config", "default.toml"),
  path.join(os.homedir(), ".wrangler", "config", "default.toml"),
  path.join(os.homedir(), ".config", ".wrangler", "config", "default.toml"),
];

function readToken() {
  for (const file of CONFIG_CANDIDATES) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    const m = text.match(/^oauth_token\s*=\s*"(.*)"\s*$/m);
    if (m && m[1]) return m[1];
  }
  throw new Error(
    "No se encontró oauth_token de wrangler. Ejecuta `npx wrangler whoami` para reautenticar."
  );
}

const TOKEN = readToken();

async function listAll() {
  const objects = [];
  let cursor = null;
  let page = 0;
  for (;;) {
    page += 1;
    const url = new URL(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/objects`
    );
    url.searchParams.set("per_page", "1000");
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
    const body = await res.json();
    if (!res.ok || !body.success) {
      throw new Error(`API ${res.status}: ${JSON.stringify(body.errors || body)}`);
    }
    const batch = body.result || [];
    objects.push(...batch);
    process.stderr.write(`  página ${page}: +${batch.length} (total ${objects.length})\n`);

    const next = body.result_info && body.result_info.cursor;
    if (!next || batch.length === 0) break;
    cursor = next;
  }
  return objects;
}

function ext(key) {
  const base = key.split("/").pop() || "";
  const i = base.lastIndexOf(".");
  return i === -1 ? "(sin extensión)" : base.slice(i).toLowerCase();
}

function fmt(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

const IMAGE_EXT = new Set([".webp", ".png", ".jpg", ".jpeg", ".gif", ".avif", ".bmp", ".tiff", ".svg"]);

const objects = await listAll();

const outDir = path.join("audit", "tmp");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, "r2-inventory.json");
fs.writeFileSync(outFile, JSON.stringify(objects, null, 2));

console.log("");
console.log(`Objetos en ${BUCKET}: ${objects.length}`);
console.log(`Peso total: ${fmt(objects.reduce((a, o) => a + (o.size || 0), 0))}`);
console.log(`Inventario crudo: ${outFile}`);
console.log("");

// --- por extensión ---
const byExt = new Map();
for (const o of objects) {
  const e = ext(o.key);
  const cur = byExt.get(e) || { n: 0, bytes: 0 };
  cur.n += 1;
  cur.bytes += o.size || 0;
  byExt.set(e, cur);
}
console.log("Por extensión (de la clave):");
for (const [e, v] of [...byExt.entries()].sort((a, b) => b[1].bytes - a[1].bytes)) {
  console.log(`  ${e.padEnd(16)} ${String(v.n).padStart(4)} obj  ${fmt(v.bytes)}`);
}
console.log("");

// --- por content-type real ---
const byCt = new Map();
for (const o of objects) {
  const ct = (o.http_metadata && o.http_metadata.contentType) || "(sin content-type)";
  const cur = byCt.get(ct) || { n: 0, bytes: 0 };
  cur.n += 1;
  cur.bytes += o.size || 0;
  byCt.set(ct, cur);
}
console.log("Por content-type almacenado:");
for (const [ct, v] of [...byCt.entries()].sort((a, b) => b[1].bytes - a[1].bytes)) {
  console.log(`  ${ct.padEnd(34)} ${String(v.n).padStart(4)} obj  ${fmt(v.bytes)}`);
}
console.log("");

// --- imágenes que no son WebP ---
const noWebpImages = objects.filter((o) => {
  const e = ext(o.key);
  if (!IMAGE_EXT.has(e)) return false;
  return e !== ".webp";
});
console.log(`Imágenes (por extensión) que NO son .webp: ${noWebpImages.length}`);
for (const o of noWebpImages.sort((a, b) => a.key.localeCompare(b.key))) {
  console.log(`  ${fmt(o.size).padStart(10)}  ${(o.http_metadata && o.http_metadata.contentType) || "-"}  ${o.key}`);
}
console.log("");

// --- imágenes cuyo content-type NO es image/webp (aunque la clave diga .webp) ---
const noWebpCt = objects.filter((o) => {
  const ct = (o.http_metadata && o.http_metadata.contentType) || "";
  return ct.startsWith("image/") && ct !== "image/webp";
});
console.log(`Objetos con content-type image/* distinto de image/webp: ${noWebpCt.length}`);
for (const o of noWebpCt.sort((a, b) => a.key.localeCompare(b.key))) {
  console.log(`  ${fmt(o.size).padStart(10)}  ${(o.http_metadata && o.http_metadata.contentType) || "-"}  ${o.key}`);
}
console.log("");
