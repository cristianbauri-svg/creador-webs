/**
 * Auditoría (SOLO LECTURA): qué imágenes sin variantes están realmente en
 * riesgo. Solo renderCards() y renderGallery() (public/js/app.js) emiten
 * srcset; el resto de bloques usan un <img src> normal y nunca piden variantes.
 *
 * Uso: node audit-variantes-uso.mjs
 */
import { execSync } from 'node:child_process';

const SITE = 'https://stratonaudio.com.co';
const CWD = 'C:/Users/USUARIO/dev/worktrees/straton-audio-web';

function d1(sql) {
  const out = execSync(
    `npx wrangler d1 execute straton-db --remote --json --command "${sql}"`,
    { cwd: CWD, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }
  );
  return JSON.parse(out.slice(out.indexOf('[')))[0].results || [];
}

const filas = d1('SELECT slug, status, content_json FROM pages');

// URLs usadas por bloques que SÍ emiten srcset (cards, gallery).
const enRiesgo = new Map(); // url -> [slug...]
// URLs usadas por bloques que NO emiten srcset (hero, image, carousel, ...).
const seguras = new Map();

for (const fila of filas) {
  let bloques;
  try {
    bloques = JSON.parse(fila.content_json || '[]');
  } catch {
    continue;
  }
  if (!Array.isArray(bloques)) continue;

  for (const bloque of bloques) {
    const props = bloque.props || {};
    const urls = [];

    if (bloque.type === 'cards' && Array.isArray(props.cards)) {
      props.cards.forEach((c) => c && c.image && urls.push(c.image));
    } else if (bloque.type === 'gallery' && Array.isArray(props.images)) {
      props.images.forEach((i) => i && i.url && urls.push(i.url));
    } else {
      // Cualquier otro tipo: se recogen sus URLs pero como "seguras".
      for (const v of Object.values(props)) {
        if (typeof v === 'string' && /\/api\/media\/products\/.*\.webp$/i.test(v)) urls.push(v);
      }
    }

    const destino = bloque.type === 'cards' || bloque.type === 'gallery' ? enRiesgo : seguras;
    for (const u of urls) {
      if (!/^\/api\/media\/products\/.*\.webp$/i.test(u)) continue;
      if (!destino.has(u)) destino.set(u, new Set());
      destino.get(u).add(`${fila.slug} [${bloque.type}]`);
    }
  }
}

async function tieneVariantes(url) {
  const base = url.replace(/\.webp$/i, '');
  const res = await Promise.all(
    ['-640', '-1280'].map((s) => fetch(SITE + base + s + '.webp', { method: 'HEAD' }))
  );
  return res.every((r) => r.status === 200);
}

console.log(`\nPáginas analizadas: ${filas.length}`);
console.log(`URLs en bloques con srcset (cards/gallery): ${enRiesgo.size}`);
console.log(`URLs en bloques sin srcset (hero/image/otros): ${seguras.size}\n`);

const rotasAhora = [];
const latentes = []; // referenciadas en otros bloques; se romperían si se copian a un card

for (const [url, donde] of enRiesgo) {
  if (!(await tieneVariantes(url))) rotasAhora.push({ url, donde: [...donde] });
}
for (const [url, donde] of seguras) {
  if (enRiesgo.has(url)) continue;
  if (!(await tieneVariantes(url))) latentes.push({ url, donde: [...donde] });
}

console.log('=========================================================');
console.log(' ROTO HOY (bloque cards/gallery sin variantes)');
console.log('=========================================================');
if (!rotasAhora.length) {
  console.log('  Ninguna: los bloques cards/gallery de producción están sanos.\n');
} else {
  for (const r of rotasAhora) console.log(`  ✗ ${r.url}\n      usado en: ${r.donde.join(', ')}`);
  console.log('');
}

console.log('=========================================================');
console.log(' LATENTE (sin srcset hoy, se rompería si se usa en un card)');
console.log('=========================================================');
if (!latentes.length) {
  console.log('  Ninguna.\n');
} else {
  for (const r of latentes) console.log(`  · ${r.url}\n      usado en: ${r.donde.slice(0, 3).join(', ')}`);
  console.log('');
}
console.log(`Total a generar si se hace backfill: ${rotasAhora.length + latentes.length} imágenes x 2 variantes\n`);
