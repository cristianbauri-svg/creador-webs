// One-time: genera variantes WebP responsive de las imágenes de producto
// referenciadas en content_json de páginas publicadas (sonido + pantallas-led).
//
//   - Imágenes en <img> (cards/gallery/image) → -640 y -1280 (srcset)
//   - Fondos hero/banner (CSS background)     → -1600 (una sola)
//
// Descarga de producción, redimensiona con sharp y guarda en audit/img-variants/.
// Luego se suben a R2 con `wrangler r2 object put`.

import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const BASE = "https://stratonaudio.com.co/api/media/";

// uuid.webp  ->  variantes
const HERO_BG = [
  "products/1edf0c65-2704-4992-b574-689ae5ea8024.webp",
  "products/9d40c561-e02f-4881-a621-644863b6d044.webp",
  "products/accb711a-e3ea-4a26-8115-e2dbe9029e4c.webp",
  "products/f8db6469-da58-4184-a02b-14489ad4256e.webp",
];

const IMG = [
  "products/388f0104-c13b-4bee-a34c-466a5b6ef65d.webp",
  "products/41c4db08-e6ea-4066-bf97-ab562da59611.webp",
  "products/457db023-fbda-4446-a511-465613a97c86.webp",
  "products/481eead0-7d96-44bf-8d1f-20fec1359689.webp",
  "products/50cb15bd-a234-4229-9a12-1d3a779a8f67.webp",
  "products/599ffa9e-100a-4af9-9cea-d44dad4f1ec2.webp",
  "products/61af7dc4-3124-4a65-9ac1-f1a1acb9a157.webp",
  "products/68d05c72-35f5-4e00-a75d-e9d9bf20693b.webp",
  "products/7d67c887-92ef-46d3-a1da-d428217f6177.webp",
  "products/93d3cdc7-6e4f-43b5-85ac-4e3bf1e1c144.webp",
  "products/963cd0b3-d0c3-44d4-8e1a-caf089d98d0b.webp",
  "products/b2ce9edf-9573-4828-b69b-45ad894f52b4.webp",
  "products/bea30d1a-e2f1-4182-b9d4-2099299a00e3.webp",
  "products/cbe9bcef-06fc-4930-b9ff-315e398d1a5c.webp",
  "products/d52bc78d-c48e-4520-bfec-6b5b2f294333.webp",
  "products/e535f9df-3eea-4d9b-889d-342cccfecd64.webp",
];

const OUT_DIR = path.resolve("audit/img-variants");
fs.mkdirSync(OUT_DIR, { recursive: true });

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function makeVariant(key, width, quality) {
  const src = await download(BASE + key);
  const buf = await sharp(src).resize({ width }).webp({ quality }).toBuffer();
  const outKey = key.replace(/\.webp$/, `-${width}.webp`);
  const outPath = path.join(OUT_DIR, outKey);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
  const dims = await sharp(buf).metadata();
  console.log(
    `${outKey.padEnd(60)} ${String(dims.width).padStart(5)}x${String(dims.height).padStart(5)}  ` +
      `${String(src.length).padStart(7)}B -> ${String(buf.length).padStart(7)}B`
  );
  return outKey;
}

async function main() {
  let total = 0;
  for (const key of IMG) {
    await makeVariant(key, 640, 75);
    await makeVariant(key, 1280, 72);
    total += 2;
  }
  for (const key of HERO_BG) {
    await makeVariant(key, 1600, 72);
    total += 1;
  }
  console.log(`\nTotal variantes generadas: ${total}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
