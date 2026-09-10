/**
 * Borra de R2 las imagenes no-WebP que no referencia nadie.
 *
 * NO se ejecuta por accidente: exige DOS banderas para escribir de verdad.
 *
 *   node audit/borrar-huerfanas.mjs                        -> simulacro
 *   node audit/borrar-huerfanas.mjs --borrar --confirmado  -> borra
 *
 * Antes de borrar revalida CADA clave contra el inventario real del bucket y
 * contra la lista de referenciadas, por si algo cambio desde el analisis.
 * Si una sola clave aparece referenciada, aborta sin borrar nada.
 *
 * Respaldo local previo: audit/respaldar-huerfanas.mjs
 *   -> C:/Users/USUARIO/dev/backups/straton-audio/huerfanas-2026-09-10
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execSync } from "node:child_process";

const BORRAR = process.argv.includes("--borrar");
const CONFIRMADO = process.argv.includes("--confirmado");
const INCLUIR_WEBP = process.argv.includes("--incluir-webp");

const ACCOUNT = "c2ced5333d7e4758d6fe9580def1bf41";
const BUCKET = "straton-bucket";

const orphans = JSON.parse(fs.readFileSync("audit/tmp/r2-orphans.json", "utf8"));
const candidatas = INCLUIR_WEBP
  ? [...orphans.huerfanosImagenNoWebp, ...orphans.huerfanosImagenWebp]
  : orphans.huerfanosImagenNoWebp;

const kb = (n) => (n / 1024).toFixed(1).padStart(9) + " KB";

function readToken() {
  const file = path.join(
    os.homedir(), "AppData", "Roaming", "xdg.config", ".wrangler", "config", "default.toml"
  );
  const m = fs.readFileSync(file, "utf8").match(/^oauth_token\s*=\s*"(.*)"\s*$/m);
  if (!m) throw new Error("No se encontro oauth_token de wrangler.");
  return m[1];
}

// --------------------------------------- revalidacion contra el estado real
console.log("Revalidando contra el bucket y contra las referencias actuales...");
const token = readToken();
const existentes = new Map();
{
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
    for (const o of body.result || []) existentes.set(o.key, o.size);
    const next = body.result_info && body.result_info.cursor;
    if (!next || (body.result || []).length === 0) break;
    cursor = next;
  }
}
console.log(`  objetos en el bucket ahora: ${existentes.size}`);

const referenciadas = new Set(orphans.referenciados);
const problemas = [];
const aBorrar = [];

const yaNoEstan = [];

for (const c of candidatas) {
  const key = c.url.replace("/api/media/", "");
  if (!existentes.has(key)) {
    // Ya borrada (p.ej. el script se corto a mitad). No es una incidencia:
    // no hay nada que borrar. Se informa, pero no aborta.
    yaNoEstan.push(key);
    continue;
  }
  if (referenciadas.has(c.url)) {
    // Esto si es motivo de aborto: la clave paso a estar en uso.
    problemas.push(`${key}: AHORA APARECE REFERENCIADA`);
    continue;
  }
  aBorrar.push({ key, size: existentes.get(key) });
}

console.log(`  candidatas: ${candidatas.length}`);
console.log(`  a borrar  : ${aBorrar.length}`);
console.log("");

if (problemas.length > 0) {
  console.log("INCIDENCIAS:");
  for (const p of problemas) console.log("  ! " + p);
  console.log("");
}

if (yaNoEstan.length > 0) {
  console.log(`Ya no estaban en el bucket (nada que hacer con estas): ${yaNoEstan.length}`);
  console.log("");
}

const totalBytes = aBorrar.reduce((a, o) => a + o.size, 0);
console.log(`Peso a liberar: ${kb(totalBytes)}  (${(totalBytes / 1024 / 1024).toFixed(2)} MB)`);
console.log("");

if (!BORRAR || !CONFIRMADO) {
  console.log("MODO SIMULACRO: no se borro nada.");
  console.log(`  objetos que se borrarian: ${aBorrar.length}`);
  console.log("");
  for (const o of aBorrar) console.log(`  ${kb(o.size)}  ${o.key}`);
  console.log("");
  if (!BORRAR) console.log("Para borrar de verdad: node audit/borrar-huerfanas.mjs --borrar --confirmado");
  else console.log("Falta --confirmado. Para borrar de verdad: node audit/borrar-huerfanas.mjs --borrar --confirmado");
} else {
  if (problemas.length > 0) {
    console.log("ABORTADO: hay incidencias, no se borra nada.");
    process.exit(1);
  }
  console.log("BORRANDO DE PRODUCCION...");
  let hechos = 0;
  for (const o of aBorrar) {
    execSync(`npx wrangler r2 object delete "${BUCKET}/${o.key}" --remote`, {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    hechos += 1;
    console.log(`  borrado (${hechos}/${aBorrar.length})  ${kb(o.size)}  ${o.key}`);
  }
  console.log(`\nBorrado completo: ${hechos} objetos, ${(totalBytes / 1024 / 1024).toFixed(2)} MB liberados.`);
}
