/**
 * Backfill de variantes -640 / -1280 para las 15 imagenes .webp de produccion
 * que no las tienen. Son imagenes referenciadas por el sitio: hoy funcionan
 * porque solo se usan como <img src>, pero si alguna vez entran a un bloque
 * Cards o Galeria, imgVariants() anuncia las variantes, el navegador recibe 404
 * y NO cae de vuelta al src: la imagen desaparece. Este script cierra ese
 * pendiente.
 *
 * Aplica exactamente la misma regla que uploadFile() del admin y que
 * buildVariantBlob():
 *   - WebP calidad 82
 *   - nunca agranda: si el original es mas angosto que el objetivo, la variante
 *     son los bytes del propio original (asi la URL existe y no hay 404)
 *
 * SEGURIDAD: nunca sobrescribe. Antes de subir consulta el inventario real del
 * bucket y omite cualquier clave que ya exista.
 *
 * MODO POR DEFECTO: solo descarga y genera en local, no sube nada.
 * Para escribir en produccion:  node audit/backfill-variantes.mjs --subir
 */
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

const SITE = "https://stratonaudio.com.co";
const OUT = path.resolve("audit/variantes-backfill");
const SUBIR = process.argv.includes("--subir");
const ANCHOS = [640, 1280];

const ACCOUNT = "c2ced5333d7e4758d6fe9580def1bf41";
const BUCKET = "straton-bucket";

// Las 15, calculadas cruzando el inventario del bucket con las URLs que el
// sitio referencia (audit/r2-orphans.mjs). Ninguna tiene -640 ni -1280.
const KEYS = [
  "products/00fd5aa7-d801-4877-9c27-4aa76aaad0a2.webp",
  "products/05cff664-81e9-40fa-ac5d-bd92db912b84.webp",
  "products/25bc6cb3-7230-4c3c-9697-67cfdcd80fb9.webp",
  "products/38eb5d39-c4aa-415b-bda1-3597fc913a6d.webp",
  "products/4c554475-6833-40af-b877-c27f7d5cfb88.webp",
  "products/5ba89932-06c0-462a-b3b0-55348178ddd2.webp",
  "products/66ab4fda-58bd-4f97-8aba-63e65e642abd.webp",
  "products/6b694ff1-67fa-491c-b24b-97b2e8cd061b.webp",
  "products/6c5908f4-0d0a-4e1f-9e7b-5f29260d5b12.webp",
  "products/6d8faa51-6ede-4e93-8464-7cf161e69e71.webp",
  "products/76586a03-8127-4918-8747-7a3f15e519e9.webp",
  "products/8310a41c-1ad5-436f-b5d0-5b9dc6a3631b.webp",
  "products/b50dd781-95c8-45ed-bcdb-a1bbf0619914.webp",
  "products/e0828ed7-00f3-4b44-b323-d64ad97694b9.webp",
  "products/f779e967-4f94-496d-ab53-4db5a2f421f3.webp",
];

// --------------------------------------------------- inventario real del bucket
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

const kb = (n) => (n / 1024).toFixed(1).padStart(7) + " KB";

console.log("Consultando inventario real del bucket...");
const existentes = await clavesExistentes();
console.log(`  ${existentes.size} objetos en ${BUCKET}\n`);

fs.mkdirSync(path.join(OUT, "variantes"), { recursive: true });

const generados = [];
const yaExistian = [];
const fallidos = [];

for (const key of KEYS) {
  // Cache-buster para forzar lectura desde R2 y no desde el edge cacheado.
  const url = `${SITE}/api/media/${key}?backfill=${Date.now()}`;
  const uuid = path.basename(key, ".webp");

  const res = await fetch(url);
  if (!res.ok) {
    console.log(`  ! ${key}: HTTP ${res.status}, se omite`);
    fallidos.push({ key, motivo: `HTTP ${res.status}` });
    continue;
  }
  const original = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(original).metadata();
  console.log(`${key}`);
  console.log(`  original: ${meta.width}x${meta.height}  ${kb(original.length)}  (${original.length} bytes)`);

  for (const ancho of ANCHOS) {
    const destino = `products/${uuid}-${ancho}.webp`;

    if (existentes.has(destino)) {
      console.log(`  -${ancho}: YA EXISTE en el bucket, se omite (no se sobrescribe)`);
      yaExistian.push(destino);
      continue;
    }

    let buf;
    let nota;
    if (meta.width <= ancho) {
      // Misma regla que el admin: no se agranda, la variante es el original.
      buf = original;
      nota = "sin agrandar (= original)";
    } else {
      buf = await sharp(original)
        .resize({ width: ancho, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      const m2 = await sharp(buf).metadata();
      nota = `${m2.width}x${m2.height}`;
    }
    const archivo = path.join(OUT, "variantes", `${uuid}-${ancho}.webp`);
    fs.writeFileSync(archivo, buf);
    console.log(`  -${ancho}: ${kb(buf.length)}  ${nota}`);
    generados.push({ key: destino, archivo, bytes: buf.length });
  }
  console.log("");
}

console.log("-------------------------------------------------------------");
console.log(`Variantes generadas : ${generados.length}`);
console.log(`Ya existian         : ${yaExistian.length}`);
console.log(`Fallidas            : ${fallidos.length}`);
for (const f of fallidos) console.log(`   ! ${f.key}: ${f.motivo}`);

if (!SUBIR) {
  console.log("\nMODO SIMULACRO: no se subio nada a R2.");
  console.log("Para escribir en produccion: node audit/backfill-variantes.mjs --subir");
} else {
  console.log("\nSUBIENDO A PRODUCCION (wrangler r2 object put --remote)...");
  for (const g of generados) {
    const destino = `${BUCKET}/${g.key}`;
    execSync(
      `npx wrangler r2 object put "${destino}" --remote --file="${g.archivo}" --content-type image/webp`,
      { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] }
    );
    console.log(`  subido  ${destino}  (${kb(g.bytes)})`);
  }
  console.log(`\nSubida completa: ${generados.length} objetos nuevos.`);
}
