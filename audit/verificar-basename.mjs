/**
 * Verificacion precisa: busca el nombre de archivo CON su extension
 * (p.ej. "388f0104-....png") en D1, KV y el repo, en cualquier forma de URL
 * (absoluta, con dominio, sin prefijo, con query string).
 *
 * Si aparece, muestra el contexto alrededor para distinguir si la referencia
 * es realmente a ese archivo o es parte del nombre de la variante .webp hermana.
 */
import fs from "node:fs";
import { execSync } from "node:child_process";

const orphans = JSON.parse(fs.readFileSync("audit/tmp/r2-orphans.json", "utf8"));
const candidatas = orphans.huerfanosImagenNoWebp;

// ---------------------------------------------------------------- corpus D1
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

// ---------------------------------------------------------------- corpus KV
let corpusKV = "";
for (const k of JSON.parse(
  execSync(`npx wrangler kv key list --namespace-id 427e7f161e08458fa8ee22a41ccb0d0a --remote`, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
).map((k) => k.name)) {
  try {
    corpusKV +=
      execSync(`npx wrangler kv key get "${k}" --namespace-id 427e7f161e08458fa8ee22a41ccb0d0a --remote`, {
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      }) || "";
  } catch {}
}

// ------------------------------------------------------------- corpus repo
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
      } catch {}
    }
  }
}
walk(".");

const FUENTES = { D1: corpusD1, KV: corpusKV, repo: corpusRepo };

// Zonas del corpus que son artefactos de auditoria, no referencias del sitio.
const ES_AUDITORIA = /r2-inventory|r2-orphans|audit\/tmp|verificar-antes|verificar-basename|borrar-huerfanas|respaldar-huerfanas|backfill|convertir-png/;

console.log("Buscando el nombre de archivo CON extension en D1, KV y repo...");
console.log("");

let sospechosas = 0;
let confirmadas = 0;

for (const c of candidatas) {
  const nombre = c.url.split("/").pop(); // UUID.ext
  const hits = [];
  for (const [fuente, corpus] of Object.entries(FUENTES)) {
    let idx = corpus.indexOf(nombre);
    while (idx !== -1) {
      const ctx = corpus.slice(Math.max(0, idx - 90), idx + nombre.length + 30);
      if (!ES_AUDITORIA.test(ctx)) hits.push({ fuente, ctx });
      idx = corpus.indexOf(nombre, idx + 1);
    }
  }
  if (hits.length > 0) {
    confirmadas += 1;
    console.log(`### ${nombre}`);
    for (const h of hits.slice(0, 6)) {
      console.log(`    [${h.fuente}] ...${h.ctx.replace(/\s+/g, " ")}...`);
    }
    if (hits.length > 6) console.log(`    (+${hits.length - 6} coincidencias mas)`);
    console.log("");
  } else {
    sospechosas += 1;
  }
}

console.log("================================================");
console.log(`Archivos con referencia real (NO borrar): ${confirmadas}`);
console.log(`Archivos sin ninguna referencia:         ${sospechosas}`);
console.log(`Total candidatas:                        ${candidatas.length}`);
