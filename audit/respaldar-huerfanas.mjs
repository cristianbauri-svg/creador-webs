/**
 * Descarga a disco las imagenes no-WebP que hoy nadie referencia, ANTES de
 * cualquier borrado en R2.
 *
 * Por que: 31 de las 39 no tienen hermano .webp, o sea que la copia de R2 es la
 * unica que existe. Borrarlas seria irreversible. Bajarlas primero convierte el
 * borrado en algo reversible.
 *
 * Solo LEE. Escribe fuera del repo para no ensuciarlo.
 *
 * Uso:  node audit/respaldar-huerfanas.mjs
 */
import fs from "node:fs";
import path from "node:path";

const SITE = "https://stratonaudio.com.co";
const DESTINO = "C:/Users/USUARIO/dev/backups/straton-audio/huerfanas-2026-09-10";

const orphans = JSON.parse(fs.readFileSync("audit/tmp/r2-orphans.json", "utf8"));
const lista = orphans.huerfanosImagenNoWebp; // [{url, size}]

fs.mkdirSync(DESTINO, { recursive: true });

const kb = (n) => (n / 1024).toFixed(1).padStart(8) + " KB";
const manifiesto = [];
let total = 0;
let problemas = 0;

console.log(`Descargando ${lista.length} objetos a ${DESTINO}\n`);

for (const item of lista.sort((a, b) => a.url.localeCompare(b.url))) {
  const nombre = item.url.replace("/api/media/products/", "");
  const salida = path.join(DESTINO, nombre);

  // Cache-buster para leer desde R2 y no desde una copia cacheada en el edge.
  const res = await fetch(SITE + item.url + "?respaldo=" + Date.now());
  if (!res.ok) {
    console.log(`  ! ${nombre}: HTTP ${res.status}`);
    problemas += 1;
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(salida, buf);

  // El tamano debe coincidir con el que reporta el inventario del bucket.
  const coincide = buf.length === item.size;
  if (!coincide) problemas += 1;
  total += buf.length;

  manifiesto.push({
    url: item.url,
    archivo: nombre,
    bytes: buf.length,
    bytes_en_r2: item.size,
    coincide_con_r2: coincide,
  });

  console.log(`  ${kb(buf.length)}  ${coincide ? "ok " : "DIF"}  ${nombre}`);
}

fs.writeFileSync(
  path.join(DESTINO, "_manifiesto.json"),
  JSON.stringify(
    {
      fecha: new Date().toISOString(),
      origen: SITE,
      objetos: manifiesto.length,
      bytes_totales: total,
      detalle: manifiesto,
    },
    null,
    2
  )
);

console.log("");
console.log("-------------------------------------------------------------");
console.log(`Objetos descargados : ${manifiesto.length} / ${lista.length}`);
console.log(`Peso total          : ${kb(total)}  (${(total / 1024 / 1024).toFixed(2)} MB)`);
console.log(`Discrepancias       : ${problemas}`);
console.log(`Carpeta             : ${DESTINO}`);
console.log(`Manifiesto          : ${path.join(DESTINO, "_manifiesto.json")}`);
