/**
 * Ultima verificacion antes de borrar las huerfanas. Solo lectura.
 *
 * Busca el UUID SOLO (sin ruta, sin extension, sin /api/media/) por si alguna
 * referencia usa otra forma de URL que el analisis previo no contemplaba:
 * URL absoluta, prefijo distinto, query string, o el id suelto en un JSON.
 *
 * Fuentes: todo el repo + D1 de produccion (todas las tablas) + KV de produccion.
 */
import fs from "node:fs";
import { execSync } from "node:child_process";

const orphans = JSON.parse(fs.readFileSync("audit/tmp/r2-orphans.json", "utf8"));
const candidatas = orphans.huerfanosImagenNoWebp;

// UUID por si solo: sin extension, sin carpeta, sin prefijo.
const ids = candidatas.map((c) => {
  const base = c.url.split("/").pop();
  return { url: c.url, id: base.replace(/\.[a-z0-9]+$/i, "") };
});

const kb = (n) => (n / 1024).toFixed(1).padStart(9) + " KB";

// ---------------------------------------------------------------- corpus D1
console.log("Volcando D1 de produccion (todas las tablas)...");
const tablas = JSON.parse(
  execSync(
    `npx wrangler d1 execute straton-db --remote --json --command "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'"`,
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  )
)[0].results.map((r) => r.name);

let corpusD1 = "";
for (const t of tablas) {
  const out = JSON.parse(
    execSync(`npx wrangler d1 execute straton-db --remote --json --command "SELECT * FROM ${t}"`, {
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    })
  )[0].results;
  corpusD1 += JSON.stringify(out);
}
console.log(`  tablas: ${tablas.length}  bytes: ${corpusD1.length}`);

// ---------------------------------------------------------------- corpus KV
console.log("Volcando KV de produccion...");
let corpusKV = "";
let claves = [];
try {
  claves = JSON.parse(
    execSync(`npx wrangler kv key list --namespace-id 427e7f161e08458fa8ee22a41ccb0d0a --remote`, {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    })
  ).map((k) => k.name);
  for (const k of claves) {
    try {
      corpusKV +=
        execSync(
          `npx wrangler kv key get "${k}" --namespace-id 427e7f161e08458fa8ee22a41ccb0d0a --remote`,
          { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
        ) || "";
    } catch {
      /* clave binaria o ilegible: se ignora */
    }
  }
} catch (e) {
  console.log(`  (no se pudo listar KV: ${e.message.split("\n")[0]})`);
}
console.log(`  claves: ${claves.length}  bytes: ${corpusKV.length}`);

// ------------------------------------------------------------- corpus repo
console.log("Leyendo el repo...");
let corpusRepo = "";
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".git" || e.name === "tmp") continue;
      walk(p);
    } else if (/\.(html|js|mjs|cjs|ts|tsx|json|jsonc|css|sql|md|txt|toml|yaml|yml)$/i.test(e.name)) {
      try {
        corpusRepo += fs.readFileSync(p, "utf8");
      } catch {
        /* binario */
      }
    }
  }
}
walk(".");
// El propio inventario y este analisis no cuentan como referencias reales.
const esRuido = corpusRepo.includes("r2-inventory");
console.log(`  bytes: ${corpusRepo.length}${esRuido ? "  (incluye artefactos de auditoria)" : ""}`);

// ------------------------------------------------------------------ chequeo
console.log("");
console.log("Buscando cada id en las tres fuentes...");
const hallazgos = [];
for (const { url, id } of ids) {
  const enRepo = corpusRepo.includes(id);
  const enD1 = corpusD1.includes(id);
  const enKV = corpusKV.includes(id);
  if (enRepo || enD1 || enKV) {
    // Descartar el ruido de los propios artefactos de auditoria.
    const fuentes = [];
    if (enD1) fuentes.push("D1");
    if (enKV) fuentes.push("KV");
    if (enRepo) fuentes.push("repo");
    hallazgos.push({ url, id, fuentes: fuentes.join("+") });
  }
}

console.log("");
if (hallazgos.length === 0) {
  console.log("LIMPIO: ningun id aparece en D1, KV ni el repo.");
  console.log(`  ids verificados: ${ids.length}`);
} else {
  console.log(`ATENCION: ${hallazgos.length} id(s) aparecen en algun lado:`);
  for (const h of hallazgos) console.log(`  [${h.fuentes}] ${h.id}  <- ${h.url}`);
  console.log("");
  console.log("Revisar si es referencia real o artefacto de auditoria antes de borrar.");
}

console.log("");
console.log(`Total a liberar si se borran las ${candidatas.length}:`);
const total = candidatas.reduce((a, c) => a + (c.size || 0), 0);
console.log(`  ${kb(total)}  (${(total / 1024 / 1024).toFixed(2)} MB)`);
