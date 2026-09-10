/**
 * Renombra a .webp cinco claves de R2 cuya EXTENSION no coincide con su
 * contenido, y les genera las variantes -640 / -1280.
 *
 * El problema: /sonido referencia 5 imagenes cuyas claves terminan en .jpeg,
 * pero cuyo contenido YA es WebP (se sirven con Content-Type image/webp). La
 * regla de imgVariants() en public/js/app.js exige que la URL termine en .webp
 * para emitir srcset, asi que esas 5 se saltan el srcset y el navegador baja
 * el archivo de 1600px para pintarlo en cajas de ~170px.
 *
 * La correccion es de datos, no de codigo: copiar la clave a .webp y subir las
 * variantes. El camino queda identico al de las otras 21 imagenes del sitio.
 *
 * NO BORRA NADA. La clave .jpeg original queda intacta, asi que las URLs
 * antiguas siguen respondiendo.
 *
 * Reglas de generacion identicas al admin (pages.html) y a uploadFile():
 *   - WebP calidad 82
 *   - nunca agranda: si el original es mas angosto que el objetivo, la variante
 *     son los bytes del propio original
 *
 * SEGURIDAD: antes de subir consulta el inventario real del bucket y omite
 * cualquier clave que ya exista.
 *
 * MODO POR DEFECTO: solo descarga y genera en local, no sube nada.
 * Para escribir en produccion:  node audit/renombrar-claves-webp.mjs --subir
 */
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

const SITE = "https://stratonaudio.com.co";
const OUT = path.resolve("audit/renombre-webp");
const SUBIR = process.argv.includes("--subir");
const ANCHOS = [640, 1280];

const ACCOUNT = "c2ced5333d7e4758d6fe9580def1bf41";
const BUCKET = "straton-bucket";

// Las 5 claves mal nombradas. Todas aparecen solo en el contenido de /sonido:
// 3 en el bloque de cards [13] y 2 en la galeria [7].
const KEYS = [
  "products/f35d3ef3-8d5e-4c3e-88af-2e38aa2fc60f.jpeg",
  "products/46224921-fec3-401d-abd3-672b7b84b011.jpeg",
  "products/fc4f0be4-5af1-44fa-9d13-2bc3ca816e53.jpeg",
  "products/838d38b1-8d54-4308-acff-a19b7c941e4a.jpeg",
  "products/7de74943-0533-4c11-8940-f9d0ead29c13.jpeg",
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
  // El oauth_token del archivo puede estar vencido: wrangler solo lo renueva
  // cuando ejecuta algo. Un comando barato garantiza un token fresco; sin esto
  // la API responde {"code":10000,"message":"Authentication error"}.
  try {
    execSync("npx wrangler whoami", { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
  } catch {
    // Si falla, se intenta igual con el token que haya en disco.
  }
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

/** Un WebP empieza con "RIFF"<4 bytes>"WEBP". */
function esWebP(buf) {
  return buf.length > 12 && buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP";
}

const kb = (n) => (n / 1024).toFixed(1).padStart(7) + " KB";

console.log("Consultando inventario real del bucket...");
const existentes = await clavesExistentes();
console.log(`  ${existentes.size} objetos en ${BUCKET}\n`);

fs.mkdirSync(path.join(OUT, "archivos"), { recursive: true });

const aSubir = [];
const yaExistian = [];
const fallidos = [];

for (const key of KEYS) {
  // Cache-buster para forzar lectura desde R2 y no desde el edge cacheado.
  const url = `${SITE}/api/media/${key}?renombre=${Date.now()}`;
  const uuid = path.basename(key).replace(/\.[^.]+$/, "");

  const res = await fetch(url);
  if (!res.ok) {
    console.log(`  ! ${key}: HTTP ${res.status}, se omite`);
    fallidos.push({ key, motivo: `HTTP ${res.status}` });
    continue;
  }
  const original = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(original).metadata();
  console.log(key);
  console.log(`  original: ${meta.width}x${meta.height}  ${kb(original.length)}  formato real: ${meta.format}`);

  if (!esWebP(original)) {
    console.log(`  ! ABORTA: el contenido no es WebP (es ${meta.format}). No se renombra.`);
    fallidos.push({ key, motivo: `contenido ${meta.format}, no WebP` });
    continue;
  }

  // 1) La clave base, copiada a .webp con los mismos bytes.
  const destinoBase = `products/${uuid}.webp`;
  if (existentes.has(destinoBase)) {
    console.log(`  base: YA EXISTE ${destinoBase}, se omite (no se sobrescribe)`);
    yaExistian.push(destinoBase);
  } else {
    const archivo = path.join(OUT, "archivos", `${uuid}.webp`);
    fs.writeFileSync(archivo, original);
    console.log(`  base: -> ${destinoBase}  ${kb(original.length)}  (mismos bytes)`);
    aSubir.push({ key: destinoBase, archivo, bytes: original.length, tipo: "image/webp" });
  }

  // 2) Las variantes responsive.
  for (const ancho of ANCHOS) {
    const destino = `products/${uuid}-${ancho}.webp`;
    if (existentes.has(destino)) {
      console.log(`  -${ancho}: YA EXISTE, se omite (no se sobrescribe)`);
      yaExistian.push(destino);
      continue;
    }
    let buf;
    let nota;
    if (meta.width <= ancho) {
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
    const archivo = path.join(OUT, "archivos", `${uuid}-${ancho}.webp`);
    fs.writeFileSync(archivo, buf);
    console.log(`  -${ancho}: ${kb(buf.length)}  ${nota}`);
    aSubir.push({ key: destino, archivo, bytes: buf.length, tipo: "image/webp" });
  }
  console.log("");
}

console.log("-------------------------------------------------------------");
console.log(`Objetos nuevos a subir : ${aSubir.length}`);
console.log(`Ya existian (omitidos) : ${yaExistian.length}`);
console.log(`Fallidos               : ${fallidos.length}`);
for (const f of fallidos) console.log(`   ! ${f.key}: ${f.motivo}`);

if (fallidos.length) {
  console.log("\nHay fallidos: NO se sube nada hasta resolverlos.");
  process.exit(1);
}

if (!SUBIR) {
  console.log("\nMODO SIMULACRO: no se subio nada a R2.");
  console.log("Para escribir en produccion: node audit/renombrar-claves-webp.mjs --subir");
} else {
  console.log("\nSUBIENDO A PRODUCCION (wrangler r2 object put --remote)...");
  for (const g of aSubir) {
    const destino = `${BUCKET}/${g.key}`;
    execSync(
      `npx wrangler r2 object put "${destino}" --remote --file="${g.archivo}" --content-type ${g.tipo}`,
      { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] }
    );
    console.log(`  subido  ${destino}  (${kb(g.bytes)})`);
  }
  console.log(`\nSubida completa: ${aSubir.length} objetos nuevos. Nada existente fue sobrescrito.`);
}
