/**
 * Auditoría (SOLO LECTURA) de los formatos reales de las imágenes en producción.
 *
 * Recolecta TODAS las URLs /api/media/ referenciadas en D1 (cualquier extensión),
 * y para cada una compara:
 *   - la extensión que declara la URL
 *   - el content-type que realmente sirve el sitio
 *   - el peso
 * y si tiene variantes -640/-1280.
 *
 * Ojo: extensión y formato real pueden no coincidir. Las 6 imágenes optimizadas
 * el 2026-09-10 conservaron su key .png/.jpeg pero ahora sirven bytes WebP.
 *
 * Uso: node audit/audit-formatos-prod.mjs
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

function d1(sql) {
  const out = execSync(
    `npx wrangler d1 execute straton-db --remote --json --command "${sql}"`,
    { cwd: CWD, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }
  );
  return JSON.parse(out.slice(out.indexOf('[')))[0].results || [];
}

const urls = new Map(); // url -> Set(tablas)
for (const [tabla, sql] of CONSULTAS) {
  let rows = [];
  try {
    rows = d1(sql);
  } catch {
    console.log(`  ! ${tabla}: consulta fallida`);
    continue;
  }
  for (const m of JSON.stringify(rows).matchAll(/\/api\/media\/[A-Za-z0-9._\/-]+/g)) {
    const u = m[0];
    if (!urls.has(u)) urls.set(u, new Set());
    urls.get(u).add(tabla);
  }
}

const kb = (n) => (n / 1024).toFixed(0).padStart(5) + ' KB';

async function info(url) {
  const base = url.replace(/\.[^./]+$/, '');
  const esWebp = /\.webp$/i.test(url);
  const [head, v640, v1280] = await Promise.all([
    fetch(SITE + url, { method: 'HEAD' }).catch(() => null),
    esWebp ? fetch(SITE + base + '-640.webp', { method: 'HEAD' }).catch(() => null) : Promise.resolve(null),
    esWebp ? fetch(SITE + base + '-1280.webp', { method: 'HEAD' }).catch(() => null) : Promise.resolve(null),
  ]);
  const ct = head ? head.headers.get('content-type') : '(error)';
  const len = head ? Number(head.headers.get('content-length') || 0) : 0;
  return {
    url,
    ext: (url.match(/\.[^./]+$/)?.[0] || '?').toLowerCase(),
    ct,
    len,
    status: head ? head.status : -1,
    variantes: esWebp ? (v640?.status === 200 && v1280?.status === 200 ? 'si' : 'no') : 'n/a (no .webp)',
  };
}

console.log(`\nAnalizando ${urls.size} URLs /api/media/ referenciadas en producción...\n`);

const filas = [];
for (const url of [...urls.keys()].sort()) {
  filas.push(await info(url));
}

// --- Reporte por extensión declarada -------------------------------------
console.log('=================== 1. EXTENSIÓN DECLARADA EN LA URL ===================\n');
const porExt = {};
for (const f of filas) {
  porExt[f.ext] = porExt[f.ext] || { n: 0, bytes: 0 };
  porExt[f.ext].n++;
  porExt[f.ext].bytes += f.len;
}
for (const [ext, d] of Object.entries(porExt).sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ${ext.padEnd(8)} ${String(d.n).padStart(3)} imágenes   ${kb(d.bytes)} en total`);
}

// --- Reporte por formato real servido ------------------------------------
console.log('\n=================== 2. FORMATO REAL QUE SIRVE EL SITIO ===================\n');
const porCt = {};
for (const f of filas) {
  porCt[f.ct] = porCt[f.ct] || { n: 0, bytes: 0 };
  porCt[f.ct].n++;
  porCt[f.ct].bytes += f.len;
}
for (const [ct, d] of Object.entries(porCt).sort((a, b) => b[1].n - a[1].n)) {
  console.log(`  ${ct.padEnd(18)} ${String(d.n).padStart(3)} imágenes   ${kb(d.bytes)} en total`);
}

// --- Desajustes extensión vs formato -------------------------------------
const desajustes = filas.filter(
  (f) => (f.ct === 'image/webp' && f.ext !== '.webp') || (f.ct !== 'image/webp' && f.ext === '.webp')
);
console.log('\n============ 3. DESAJUSTES (la URL miente sobre el formato) ============\n');
if (!desajustes.length) console.log('  Ninguno.');
else
  for (const d of desajustes) {
    console.log(`  ${d.ext.padEnd(6)} declarado  pero sirve ${d.ct.padEnd(14)} ${kb(d.len)}  ${d.url}`);
  }

// --- Lo que NO es webp de verdad ------------------------------------------
const noWebp = filas.filter((f) => f.ct !== 'image/webp');
console.log('\n============ 4. IMÁGENES QUE REALMENTE NO SON WEBP ============\n');
if (!noWebp.length) console.log('  Ninguna: todo lo referenciado se sirve como image/webp.');
else {
  let total = 0;
  for (const f of noWebp) {
    total += f.len;
    console.log(`  ${f.ext.padEnd(6)} ${String(f.ct).padEnd(12)} ${kb(f.len)}  variantes=${f.variantes}  ${f.url}`);
    console.log(`         usado en: ${[...urls.get(f.url)].join(', ')}`);
  }
  console.log(`\n  Total no-webp: ${noWebp.length} imágenes, ${(total / 1024 / 1024).toFixed(2)} MB`);
}

console.log('\n============ 5. RESUMEN ============\n');
console.log(`  Referenciadas: ${filas.length}`);
console.log(`  Sirven WebP real: ${filas.filter((f) => f.ct === 'image/webp').length}`);
console.log(`  NO son WebP: ${noWebp.length}`);
console.log(`  Con variantes -640/-1280: ${filas.filter((f) => f.variantes === 'si').length}`);
console.log(`  .webp sin variantes: ${filas.filter((f) => f.variantes === 'no').length}\n`);
