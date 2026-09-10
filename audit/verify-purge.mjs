/**
 * Verifica en producción (SOLO LECTURA) que las 6 imágenes optimizadas ya se
 * sirven desde el edge con los bytes nuevos, es decir que el purge funcionó.
 *
 * Compara el SHA-256 de lo que devuelve el sitio en vivo contra:
 *   - audit/img-sonido-opt/opt/*.webp     (lo optimizado, lo que DEBE servirse)
 *   - audit/img-sonido-opt/backup/*       (el original, lo que NO debe servirse)
 *
 * Uso: node audit/verify-purge.mjs
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

const SITE = 'https://stratonaudio.com.co';
const DIR = 'audit/img-sonido-opt';

const KEYS = [
  'products/b903b25e-c856-4e64-a747-b615235507b0.png',
  'products/838d38b1-8d54-4308-acff-a19b7c941e4a.jpeg',
  'products/7de74943-0533-4c11-8940-f9d0ead29c13.jpeg',
  'products/f35d3ef3-8d5e-4c3e-88af-2e38aa2fc60f.jpeg',
  'products/46224921-fec3-401d-abd3-672b7b84b011.jpeg',
  'products/fc4f0be4-5af1-44fa-9d13-2bc3ca816e53.jpeg',
];

const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const uuidDe = (key) => key.split('/').pop().replace(/\.[^.]+$/, '');

// Hashes locales de referencia
const optHashes = {};
const backupHashes = {};
for (const f of readdirSync(`${DIR}/opt`)) {
  optHashes[f.replace(/\.webp$/, '')] = { hash: sha(readFileSync(`${DIR}/opt/${f}`)), size: readFileSync(`${DIR}/opt/${f}`).length };
}
for (const f of readdirSync(`${DIR}/backup`)) {
  const b = readFileSync(`${DIR}/backup/${f}`);
  backupHashes[f.replace(/\.[^.]+$/, '')] = { hash: sha(b), size: b.length };
}

console.log('\n=== VERIFICACIÓN DE PURGE: https://stratonaudio.com.co/sonido ===\n');

let ok = 0;
let pendientes = [];
let filas = [];

for (const key of KEYS) {
  const uuid = uuidDe(key);
  const url = `${SITE}/api/media/${key}`;

  // Sin query string: así se prueba justamente lo que hay cacheado en el edge.
  const res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
  const buf = Buffer.from(await res.arrayBuffer());
  const hash = sha(buf);

  const esOptimizado = hash === optHashes[uuid]?.hash;
  const esOriginal = hash === backupHashes[uuid]?.hash;

  const estado = esOptimizado ? 'OK  ' : esOriginal ? 'VIEJO' : 'OTRO';
  if (esOptimizado) ok++;
  else pendientes.push({ key, esOriginal });

  filas.push({
    key,
    estado,
    http: res.status,
    ct: res.headers.get('content-type'),
    len: buf.length,
    esperado: optHashes[uuid]?.size,
    original: backupHashes[uuid]?.size,
    cf: res.headers.get('cf-cache-status') || '-',
    age: res.headers.get('age') || '-',
  });
}

for (const f of filas) {
  console.log(`${f.estado}  ${f.key}`);
  console.log(
    `      http=${f.http} ${f.ct}  servido=${(f.len / 1024).toFixed(0)} KB  ` +
      `optimizado=${(f.esperado / 1024).toFixed(0)} KB  original=${(f.original / 1024).toFixed(0)} KB`
  );
  console.log(`      cf-cache-status=${f.cf} age=${f.age}`);
}

console.log(`\n-------------------------------------------------------------`);
if (ok === KEYS.length) {
  console.log(`RESULTADO: OK — ${ok}/${KEYS.length} imágenes sirven los bytes optimizados.`);
  console.log(`La purga quedó efectiva: los usuarios ya reciben la version liviana.`);
} else {
  console.log(`RESULTADO: ${ok}/${KEYS.length} correctas, ${pendientes.length} pendientes.`);
  for (const p of pendientes) {
    console.log(`  ${p.esOriginal ? 'sirve el ORIGINAL (purga no efectiva)' : 'bytes inesperados'}: ${p.key}`);
  }
}
console.log('-------------------------------------------------------------\n');
