/**
 * Convierte a WebP la unica imagen referenciada por el sitio que todavia se
 * sirve como PNG:
 *
 *   products/9fabf1d2-beb8-4abd-b03a-9bed5febe839.png   (17 KB, usada en la
 *                                                        fila 8 de events)
 *
 * Genera tres objetos NUEVOS junto al original (nunca lo sobrescribe):
 *   products/9fabf1d2-....webp         base, a la resolucion original
 *   products/9fabf1d2-....-640.webp    variante 640w
 *   products/9fabf1d2-....-1280.webp   variante 1280w
 *
 * Las variantes se generan con la misma regla que uploadFile() del admin:
 * calidad 82 y sin agrandar (si el original es mas angosto que el objetivo, la
 * variante son los bytes del original, para que la URL exista y no haya 404).
 * Eso mantiene la invariante que asume imgVariants(): todo
 * /api/media/products/*.webp tiene -640 y -1280.
 *
 * El PNG viejo NO se borra aqui: queda sin referencias y entra en la lista de
 * borrado que se confirma aparte.
 *
 * MODO POR DEFECTO: solo descarga y genera en local, no sube nada.
 * Para escribir en produccion:  node audit/convertir-png-a-webp.mjs --subir
 */
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

const SITE = "https://stratonaudio.com.co";
const OUT = path.resolve("audit/png-a-webp");
const SUBIR = process.argv.includes("--subir");
const ANCHOS = [640, 1280];

const ACCOUNT = "c2ced5333d7e4758d6fe9580def1bf41";
const BUCKET = "straton-bucket";

const KEY_PNG = "products/9fabf1d2-beb8-4abd-b03a-9bed5febe839.png";
const BASE = "products/9fabf1d2-beb8-4abd-b03a-9bed5febe839"; // sin extension

const kb = (n) => (n / 1024).toFixed(1).padStart(7) + " KB";

function readToken() {
  const file = path.join(
    os.homedir(), "AppData", "Roaming", "xdg.config", ".wrangler", "config", "default.toml"
  );
  const m = fs.readFileSync(file, "utf8").match(/^oauth_token\s*=\s*"(.*)"\s*$/m);
  if (!m) throw new Error("No se encontro oauth_token de wrangler.");
  return m[1];
}

async function clavesExistentes() {
  const token = readToken();
  const keys = new Set();
  let cursor = null;
  for (;;) {
    const url = new URL(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/r2/buckets/${BUCKET}/objects`
    );
    url.searchParams.set("per_page", "1000");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json();
    if (!body.success) throw new Error(JSON.stringify(body.errors));
    for (const o of body.result || []) keys.add(o.key);
    const next = body.result_info && body.result_info.cursor;
    if (!next || (body.result || []).length === 0) break;
    cursor = next;
  }
  return keys;
}

console.log("Consultando inventario real del bucket...");
const existentes = await clavesExistentes();
console.log(`  ${existentes.size} objetos en ${BUCKET}\n`);

fs.mkdirSync(path.join(OUT, "nuevos"), { recursive: true });

// ------------------------------------------------------------- descarga
const origen = `${SITE}/api/media/${KEY_PNG}?convert=${Date.now()}`;
console.log(`Descargando ${KEY_PNG}`);
const res = await fetch(origen);
if (!res.ok) throw new Error(`No se pudo descargar el PNG: HTTP ${res.status}`);
const png = Buffer.from(await res.arrayBuffer());
fs.writeFileSync(path.join(OUT, "original.png"), png);

const meta = await sharp(png).metadata();
console.log(`  original: ${meta.width}x${meta.height}  ${kb(png.length)}  (${png.length} bytes)`);
if (meta.format !== "png") throw new Error(`Se esperaba PNG, llego ${meta.format}`);

// ------------------------------------------------------------- generacion
const generados = [];
const yaExisten = [];

// Base: misma resolucion que el PNG, recomprimida a WebP.
{
  const destino = `${BASE}.webp`;
  if (existentes.has(destino)) {
    console.log(`\n${destino}: YA EXISTE, se omite`);
    yaExisten.push(destino);
  } else {
    const buf = await sharp(png).webp({ quality: 82 }).toBuffer();
    const archivo = path.join(OUT, "nuevos", path.basename(destino));
    fs.writeFileSync(archivo, buf);
    console.log(`\n${destino}`);
    console.log(`  base    : ${kb(buf.length)}  ${meta.width}x${meta.height}`);
    generados.push({ key: destino, archivo, bytes: buf.length });
  }
}

for (const ancho of ANCHOS) {
  const destino = `${BASE}-${ancho}.webp`;
  if (existentes.has(destino)) {
    console.log(`\n${destino}: YA EXISTE, se omite`);
    yaExisten.push(destino);
    continue;
  }
  let buf;
  let nota;
  if (meta.width <= ancho) {
    // Misma regla que el admin: no se agranda, la variante es el original WebP.
    const baseWebp = fs.readFileSync(path.join(OUT, "nuevos", `${path.basename(BASE)}.webp`));
    buf = baseWebp;
    nota = "sin agrandar (= base)";
  } else {
    buf = await sharp(png)
      .resize({ width: ancho, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    const m2 = await sharp(buf).metadata();
    nota = `${m2.width}x${m2.height}`;
  }
  const archivo = path.join(OUT, "nuevos", `${path.basename(BASE)}-${ancho}.webp`);
  fs.writeFileSync(archivo, buf);
  console.log(`  -${ancho}   : ${kb(buf.length)}  ${nota}`);
  generados.push({ key: destino, archivo, bytes: buf.length });
}

console.log("\n-------------------------------------------------------------");
console.log(`Objetos nuevos a crear : ${generados.length}`);
console.log(`Ya existian            : ${yaExisten.length}`);
console.log("");
console.log("URL vieja (PNG)  : /api/media/" + KEY_PNG);
console.log("URL nueva (WebP) : /api/media/" + BASE + ".webp");
console.log("");
console.log("UPDATE de D1 pendiente (fila 8 de events):");
console.log(`  UPDATE events SET gallery_json = '["/api/media/${BASE}.webp"]' WHERE id = 8;`);
console.log("");

if (!SUBIR) {
  console.log("MODO SIMULACRO: no se subio nada a R2.");
  console.log("Para escribir en produccion: node audit/convertir-png-a-webp.mjs --subir");
} else {
  console.log("SUBIENDO A PRODUCCION (wrangler r2 object put --remote)...");
  for (const g of generados) {
    const destino = `${BUCKET}/${g.key}`;
    execSync(
      `npx wrangler r2 object put "${destino}" --remote --file="${g.archivo}" --content-type image/webp`,
      { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] }
    );
    console.log(`  subido  ${destino}  (${kb(g.bytes)})`);
  }
  console.log(`\nSubida completa: ${generados.length} objetos nuevos.`);
  console.log("El PNG viejo sigue en el bucket, ya sin referencias.");
}
