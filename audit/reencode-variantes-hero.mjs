/**
 * Re-encoda las variantes -1280 que el backfill dejó como copia byte a byte del
 * original (cuando el original medía menos de 1280 px de ancho, el script se
 * limitó a duplicarlo). Esas copias hacen que el `srcset` no ahorre nada: en un
 * móvil con DPR 2.6 el navegador pide justamente la candidata 1280w.
 *
 * No toca el original: solo reescribe la variante, que es la que el navegador
 * elige en móvil. Antes de subir nada compara cada re-encode contra el original
 * con el error medio absoluto por canal (MAE); por debajo de ~2/255 la
 * diferencia no es perceptible.
 *
 * Uso:  node audit/reencode-variantes-hero.mjs <dir-con-originales> [--q=74]
 */
import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const srcDir = process.argv[2];
const qArg = process.argv.find((a) => a.startsWith("--q="));
const qualities = qArg ? [Number(qArg.slice(4))] : [70, 74, 78, 82];

// Claves cuya variante -1280 es hoy una copia del original.
const TARGETS = [
  "4184cd47-eb95-4df2-b375-f33a2bcaffef.webp",
  "0cfbccb2-4c81-4252-953d-25a032ed5988.webp",
];

const outDir = "audit/tmp/reencode";
mkdirSync(outDir, { recursive: true });

/** Error medio absoluto por canal entre dos buffers de imagen del mismo tamaño. */
async function mae(bufA, bufB) {
  const a = await sharp(bufA).removeAlpha().raw().toBuffer();
  const b = await sharp(bufB).removeAlpha().raw().toBuffer();
  if (a.length !== b.length) return NaN;
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
  return sum / a.length;
}

for (const key of TARGETS) {
  const orig = readFileSync(join(srcDir, key));
  const meta = await sharp(orig).metadata();
  console.log(`\n=== ${key}  original ${meta.width}x${meta.height}  ${orig.length} B  alpha=${meta.hasAlpha}`);

  // La variante -1280 nunca amplía: se queda en el ancho nativo si es menor.
  const targetWidth = Math.min(1280, meta.width);

  for (const q of qualities) {
    let pipe = sharp(orig).resize({ width: targetWidth, withoutEnlargement: true });
    // El canal alfa viene del canvas del panel y es completamente opaco:
    // quitarlo ahorra bytes sin cambiar un solo píxel visible.
    if (meta.hasAlpha) {
      const { channels } = await sharp(orig).stats();
      const alpha = channels[3];
      if (alpha && alpha.min === 255) pipe = pipe.removeAlpha();
    }
    const out = await pipe.webp({ quality: q, effort: 6, smartSubsample: true }).toBuffer();
    const err = await mae(orig, out);
    const pct = ((1 - out.length / orig.length) * 100).toFixed(1);
    console.log(`  q=${q}  ${String(out.length).padStart(7)} B  (-${pct}%)  MAE=${err.toFixed(3)}/255`);
    if (qualities.length === 1) {
      const name = key.replace(/\.webp$/, "-1280.webp");
      writeFileSync(join(outDir, name), out);
      console.log(`  → escrito ${join(outDir, name)}`);
    }
  }
}
