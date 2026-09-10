/**
 * Auditoría (SOLO LECTURA) del estado de las variantes responsive en producción.
 *
 * 1. Enumera las URLs /api/media/products/*.webp realmente referenciadas en D1
 *    de producción (products, services, events, pages, testimonials).
 * 2. Comprueba contra el sitio en vivo si cada imagen tiene sus variantes
 *    -640 / -1280, que son las que anuncia imgVariants() en public/js/app.js.
 *
 * No escribe nada. Uso: node audit-variantes-prod.mjs
 */
import { execSync } from 'node:child_process';


const SITE = 'https://stratonaudio.com.co';
const CWD = 'C:/Users/USUARIO/dev/worktrees/straton-audio-web';


const CONSULTAS = [
  ['products', 'SELECT image_url FROM products UNION SELECT gallery_json FROM products'],
  ['services', 'SELECT image_url FROM services'],
  ['events', 'SELECT before_media_url FROM events UNION SELECT after_media_url FROM events UNION SELECT gallery_json FROM events'],
  ['pages', 'SELECT content_json FROM pages'],
  ['testimonials', 'SELECT avatar_url FROM testimonials'],
];

// execSync (string) pasa por cmd.exe: es la única forma de invocar npx.cmd en
// Windows. Las consultas no llevan comillas dobles, así que no hay riesgo de
// que el shell las reinterprete.
function d1(sql) {
  const out = execSync(
    `npx wrangler d1 execute straton-db --remote --json --command "${sql}"`,
    { cwd: CWD, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }
  );
  return JSON.parse(out.slice(out.indexOf('[')))[0].results || [];
}

// --- 1. Recolectar URLs referenciadas -------------------------------------
const urls = new Set();
const porTabla = {};

for (const [tabla, sql] of CONSULTAS) {
  let rows = [];
  try {
    rows = d1(sql);
  } catch (e) {
    console.log(`   ! ${tabla}: no se pudo consultar (${String(e.message).slice(0, 80)})`);
    continue;
  }
  const antes = urls.size;
  const texto = JSON.stringify(rows);
  for (const m of texto.matchAll(/\/api\/media\/products\/[A-Za-z0-9._-]+\.webp/gi)) {
    urls.add(m[0]);
  }
  porTabla[tabla] = urls.size - antes;
}

const lista = [...urls].sort();
console.log(`\nURLs /api/media/products/*.webp referenciadas en producción: ${lista.length}`);
console.log(`  ${JSON.stringify(porTabla)}\n`);

// --- 2. Comprobar variantes contra el sitio en vivo -----------------------
async function head(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return { status: res.status, len: res.headers.get('content-length') };
  } catch (e) {
    return { status: 0, error: String(e.message).slice(0, 60) };
  }
}

const conVariantes = [];
const sinVariantes = [];

for (const url of lista) {
  const base = url.replace(/\.webp$/i, '');
  const [v640, v1280] = await Promise.all([head(SITE + base + '-640.webp'), head(SITE + base + '-1280.webp')]);
  const ok = v640.status === 200 && v1280.status === 200;
  (ok ? conVariantes : sinVariantes).push({ url, v640, v1280 });
}

const pct = ((conVariantes.length / lista.length) * 100).toFixed(0);
console.log(`  con variantes completas : ${conVariantes.length}  (${pct}%)`);
console.log(`  SIN variantes (riesgo)  : ${sinVariantes.length}\n`);

if (sinVariantes.length) {
  console.log('  Imágenes sin variantes. OJO: esto NO significa que estén rotas.');
  console.log('  Solo se rompen si las renderiza un bloque Cards o Galería (los únicos');
  console.log('  que emiten srcset). Para saber si alguna lo está, usar');
  console.log('  tools/playwright/srcset-exposure.mjs, que escanea el DOM en vivo.\n');
  for (const r of sinVariantes) {
    console.log(`   · ${r.url}`);
    console.log(`       -640: ${r.v640.status}   -1280: ${r.v1280.status}`);
  }
  console.log('');
} else {
  console.log('  Todas las imágenes referenciadas tienen sus variantes.\n');
}
