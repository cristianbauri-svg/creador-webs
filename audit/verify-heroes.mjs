/**
 * Verifica en producción (SOLO LECTURA) que las 6 variantes recién subidas se
 * sirven, con el content-type correcto y con los bytes exactos que se generaron.
 * Además reintenta las que aún respondan 404, por si el edge hubiera cacheado el
 * 404 previo al backfill.
 *
 * Uso: node audit/verify-heroes.mjs
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';

const SITE = 'https://stratonaudio.com.co';
const DIR = 'audit/heroes-variantes/variantes';

const sha = (b) => createHash('sha256').update(b).digest('hex');
const esperados = {};
for (const f of readdirSync(DIR)) {
  const b = readFileSync(`${DIR}/${f}`);
  esperados[f] = { hash: sha(b), size: b.length };
}

console.log('\n=== VERIFICACIÓN DE VARIANTES DE HERO EN PRODUCCIÓN ===\n');

let ok = 0;
const fallos = [];

for (const nombre of Object.keys(esperados).sort()) {
  const url = `${SITE}/api/media/products/${nombre}`;

  // Primer intento: lo que hay en el edge tal cual.
  let res = await fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
  let buf = Buffer.from(await res.arrayBuffer());

  // Si aún viera el 404 viejo, se prueba con un cache-buster para saber si el
  // objeto existe en R2 (y entonces haría falta purgar).
  let reintento = null;
  if (res.status !== 200) {
    const r2 = await fetch(`${url}?cb=${Date.now()}`);
    reintento = { status: r2.status, ct: r2.headers.get('content-type') };
    if (r2.status === 200) {
      buf = Buffer.from(await r2.arrayBuffer());
      res = r2;
    }
  }

  const hash = sha(buf);
  const coincide = hash === esperados[nombre].hash;
  const ct = res.headers.get('content-type');
  const bien = res.status === 200 && coincide && ct === 'image/webp';
  if (bien) ok++;
  else fallos.push({ nombre, status: res.status, ct, coincide });

  console.log(`${bien ? 'OK  ' : 'FALLA'}  ${nombre}`);
  console.log(
    `      http=${res.status} ${ct}  ${(buf.length / 1024).toFixed(0)} KB  ` +
      `esperado=${(esperados[nombre].size / 1024).toFixed(0)} KB  bytes-identicos=${coincide ? 'SI' : 'NO'}`
  );
  console.log(`      cf-cache-status=${res.headers.get('cf-cache-status') || '-'}${reintento ? `  (sin cache-buster: ${reintento.status})` : ''}`);
}

console.log('\n-------------------------------------------------------------');
if (ok === Object.keys(esperados).length) {
  console.log(`RESULTADO: OK — ${ok}/6 variantes publicadas y correctas.`);
} else {
  console.log(`RESULTADO: ${ok}/6 correctas. Revisar:`);
  for (const f of fallos) console.log(`  ${f.nombre} -> http=${f.status} ct=${f.ct} bytes-identicos=${f.coincide}`);
}
console.log('-------------------------------------------------------------\n');
