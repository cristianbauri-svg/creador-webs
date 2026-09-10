/**
 * Backfill de variantes -640 / -1280 para los 3 heros de producción que no las
 * tienen. Son las únicas imágenes referenciadas por bloques Hero sin variantes.
 *
 * Aplica exactamente la misma regla que uploadFile() del admin:
 *   - WebP calidad 82
 *   - nunca agranda: si el original es más angosto que el objetivo, la variante
 *     son los bytes del propio original (así existe y el navegador no ve un 404)
 *
 * MODO POR DEFECTO: solo descarga y genera en local, no sube nada.
 * Para subir a producción:  node audit/backfill-heroes.mjs --subir
 *
 * Uso: node audit/backfill-heroes.mjs
 */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const SITE = 'https://stratonaudio.com.co';
const OUT = path.resolve('audit/heroes-variantes');
const SUBIR = process.argv.includes('--subir');
const ANCHOS = [640, 1280];

const KEYS = [
  'products/f8db6469-da58-4184-a02b-14489ad4256e.webp',
  'products/1edf0c65-2704-4992-b574-689ae5ea8024.webp',
  'products/6a02749a-c41a-4d39-b575-57ef3f1dbf51.webp',
];

fs.mkdirSync(path.join(OUT, 'original'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'variantes'), { recursive: true });

const kb = (n) => (n / 1024).toFixed(0).padStart(5) + ' KB';
const generados = [];

for (const key of KEYS) {
  const url = `${SITE}/api/media/${key}`;
  const uuid = path.basename(key, '.webp');

  const res = await fetch(url);
  if (!res.ok) {
    console.log(`  ! ${key}: HTTP ${res.status}, se omite`);
    continue;
  }
  const original = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(path.join(OUT, 'original', `${uuid}.webp`), original);

  const meta = await sharp(original).metadata();
  console.log(`\n${key}`);
  console.log(`  original: ${meta.width}x${meta.height}  ${kb(original.length)}`);

  for (const ancho of ANCHOS) {
    let buf;
    let nota;
    if (meta.width <= ancho) {
      // Misma regla que el admin: no se agranda, la variante es el original.
      buf = original;
      nota = 'sin agrandar (= original)';
    } else {
      buf = await sharp(original)
        .resize({ width: ancho, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      const m2 = await sharp(buf).metadata();
      nota = `${m2.width}x${m2.height}`;
    }
    const nombre = `${uuid}-${ancho}.webp`;
    fs.writeFileSync(path.join(OUT, 'variantes', nombre), buf);
    console.log(`  variante -${ancho}: ${kb(buf.length)}  ${nota}`);
    generados.push({ key: `products/${nombre}`, archivo: path.join(OUT, 'variantes', nombre), bytes: buf.length });
  }
}

console.log(`\n-------------------------------------------------------------`);
console.log(`Variantes generadas: ${generados.length} en ${path.relative(process.cwd(), path.join(OUT, 'variantes'))}`);

if (!SUBIR) {
  console.log('\nMODO SIMULACRO: no se subió nada a R2.');
  console.log('Para escribir en producción: node audit/backfill-heroes.mjs --subir');
} else {
  console.log('\nSUBIENDO A PRODUCCIÓN (wrangler r2 object put --remote)...');
  const { execSync } = await import('node:child_process');
  for (const g of generados) {
    const destino = `straton-bucket/${g.key}`;
    execSync(
      `npx wrangler r2 object put "${destino}" --remote --file="${g.archivo}" --content-type image/webp`,
      { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] }
    );
    console.log(`  subido  ${destino}  (${kb(g.bytes)})`);
  }
  console.log('\nSubida completa.');
}
