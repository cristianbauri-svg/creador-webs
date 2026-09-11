/**
 * ¿Qué pierde exactamente un visitante que abandona antes de los 3 segundos
 * sin interactuar?
 *
 * Lo que está en juego no es el evento de conversión —ese exige un clic, y un
 * clic ya es interacción— sino dos cosas que ocurren solas al cargar el
 * contenedor: el aviso de visita a Google Ads (remarketing) y, sobre todo, el
 * cookie que el Conversion Linker escribe con el gclid del anuncio. Sin ese
 * cookie, si la persona vuelve más tarde por otro camino y convierte, la
 * conversión no se atribuye al anuncio.
 *
 * Esta prueba entra con un gclid simulado y fotografía las cookies y las
 * peticiones a Google en varios instantes, en las dos ramas.
 *
 *   node audit/experimento-gtm/prueba-gclid.mjs <url-base> <etiqueta>
 */
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(
  "C:/Users/USUARIO/dev/tools/playwright/node_modules/playwright"
);

const BASE = process.argv[2] || "http://127.0.0.1:8799";
const RAMA = process.argv[3] || "sin-nombre";
const GCLID = "EAIaIQobPRUEBA_auditoria_1234567890";
const INSTANTES = [1000, 2000, 3000, 4000, 6000];

const MOVIL = {
  viewport: { width: 412, height: 823 },
  deviceScaleFactor: 2.625,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
};

(async () => {
  const navegador = await chromium.launch();
  const contexto = await navegador.newContext(MOVIL);
  const pagina = await contexto.newPage();
  const google = [];
  const t0 = Date.now();

  pagina.on("request", (r) => {
    const u = r.url();
    if (/googletagmanager|googleads|doubleclick|google\.com\/(ccm|pagead)|googleadservices/.test(u)) {
      google.push({ ms: Date.now() - t0, host: new URL(u).host, ruta: new URL(u).pathname.slice(0, 40) });
    }
  });

  // Se entra como lo haría alguien que viene de un anuncio.
  await pagina.goto(`${BASE}/sonido?gclid=${GCLID}`, { waitUntil: "domcontentloaded", timeout: 90000 });

  console.log(`\n########  RAMA: ${RAMA}  ########`);
  console.log(`Entrada simulada desde anuncio: /sonido?gclid=${GCLID.slice(0, 22)}…\n`);
  console.log(`${"instante".padEnd(10)} ${"cookies de Google Ads".padEnd(34)} ${"peticiones a Google"}`);
  console.log("-".repeat(78));

  let anterior = 0;
  for (const instante of INSTANTES) {
    await pagina.waitForTimeout(instante - anterior);
    anterior = instante;
    const cookies = await contexto.cookies();
    const deAds = cookies.filter((c) => /^_gcl|^_gac|^_ga$/.test(c.name)).map((c) => c.name);
    console.log(
      `${(instante + " ms").padEnd(10)} ${(deAds.length ? deAds.join(", ") : "ninguna").padEnd(34)} ${google.length}`
    );
  }

  console.log("\nCronología de peticiones a Google:");
  for (const g of google) console.log(`   ${String(g.ms).padStart(5)} ms  ${g.host}${g.ruta}`);

  const cookiesFinales = await contexto.cookies();
  console.log(
    "\nCookies finales relacionadas con la atribución:",
    cookiesFinales.filter((c) => /^_gcl|^_gac/.test(c.name)).map((c) => `${c.name}=${String(c.value).slice(0, 28)}…`).join(" | ") || "ninguna"
  );

  await navegador.close();
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
