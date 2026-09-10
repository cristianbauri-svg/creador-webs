import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";

const BASE = "https://stratonaudio.com.co/api/media/";
const items = [
  { key: "products/b903b25e-c856-4e64-a747-b615235507b0.png",  kind: "hero" },
  { key: "products/838d38b1-8d54-4308-acff-a19b7c941e4a.jpeg", kind: "img" },
  { key: "products/7de74943-0533-4c11-8940-f9d0ead29c13.jpeg", kind: "img" },
  { key: "products/f35d3ef3-8d5e-4c3e-88af-2e38aa2fc60f.jpeg", kind: "img" },
  { key: "products/46224921-fec3-401d-abd3-672b7b84b011.jpeg", kind: "img" },
  { key: "products/fc4f0be4-5af1-44fa-9d13-2bc3ca816e53.jpeg", kind: "img" },
];

const OUT = path.resolve("audit/img-sonido-opt");
const BACKUP = path.join(OUT, "backup");
const OPT = path.join(OUT, "opt");
fs.mkdirSync(BACKUP, { recursive: true });
fs.mkdirSync(OPT, { recursive: true });

async function run() {
  for (const it of items) {
    const url = BASE + it.key;
    const src = Buffer.from(await (await fetch(url)).arrayBuffer());
    const uuid = path.basename(it.key, path.extname(it.key));

    // 1) backup original
    fs.writeFileSync(path.join(BACKUP, it.key.split("/").pop()), src);

    // 2) optimizar
    let pipeline = sharp(src);
    if (it.kind === "img") {
      pipeline = pipeline.resize({ width: 1600, withoutEnlargement: true });
    }
    const buf = await pipeline.webp({ quality: 82 }).toBuffer();
    const outName = uuid + ".webp";
    fs.writeFileSync(path.join(OPT, outName), buf);

    const inMeta = await sharp(src).metadata();
    const outMeta = await sharp(buf).metadata();
    console.log(
      `${it.key.padEnd(58)}  ${String(inMeta.width).padStart(5)}x${String(inMeta.height).padStart(5)} (${(src.length/1024).toFixed(0).padStart(5)} KB)  ->  ` +
      `${String(outMeta.width).padStart(5)}x${String(outMeta.height).padStart(5)} (${(buf.length/1024).toFixed(0).padStart(5)} KB)  [${outName}]`
    );
  }
}

run().catch(e => { console.error(e); process.exit(1); });
