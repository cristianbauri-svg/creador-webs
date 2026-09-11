/**
 * ¿En qué momentos se pierde la conversión de WhatsApp?
 *
 * Barre varios instantes de toque sobre el CTA del hero de /sonido y, para
 * cada uno, anota si la petición de conversión de Google Ads llegó a salir
 * antes de que la navegación destruyera el documento. Esos botones navegan en
 * la misma pestaña, así que la carrera entre la etiqueta y la navegación es
 * justo lo que decide si la conversión se registra.
 *
 * Tres ramas, servidas por audit/experimento-gtm/proxy.mjs:
 *   actual      (8798) — producción tal como está hoy
 *   defer3s     (8799) — GTM diferido a la primera interacción o 3 s
 *   deferblank  (8796) — lo anterior más los CTA en pestaña nueva
 *
 * Sin efectos secundarios: la navegación a WhatsApp se responde con una página
 * de relleno y los POST a /api/quotations se interceptan. No se abre ningún
 * chat ni se crea ninguna cotización. Producción no se modifica.
 *
 *   node audit/experimento-gtm/ventana-conversion.mjs [repeticiones]
 */
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(
  "C:/Users/USUARIO/dev/tools/playwright/node_modules/playwright"
);

// Etiqueta de la conversión de WhatsApp en el contenedor GTM-5VQGJ3Z8.
const ETIQUETA_WHATSAPP = "g2ljCOHE7eMcEPzh5qNE";

const RAMAS = { actual: 8798, defer: 8799, "defer+pestaña": 8796 };
const INSTANTES = [800, 1500, 1800, 2500, 3000, 3500, 5000];
const REPETICIONES = Number(process.argv[2] || 2);

const MOVIL = {
  viewport: { width: 412, height: 823 },
  deviceScaleFactor: 2.625,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
};

/** Una carga completa: entra, espera, toca el CTA y observa qué sale. */
async function unaCorrida(navegador, puerto, espera) {
  const contexto = await navegador.newContext(MOVIL);
  const pagina = await contexto.newPage();
  const conversiones = [];
  const gtm = [];
  let navegacion = null;
  const t0 = Date.now();

  pagina.on("request", (r) => {
    const url = r.url();
    if (url.includes("googletagmanager.com/gtm.js")) gtm.push(Date.now() - t0);
    if (url.includes(ETIQUETA_WHATSAPP)) conversiones.push(Date.now() - t0);
  });

  await contexto.route(/wa\.me|api\.whatsapp\.com|whatsapp\.com\/send/i, (r) => {
    if (navegacion === null) navegacion = Date.now() - t0;
    r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>relleno de prueba</title>" });
  });
  await contexto.route(/\/api\/quotations/i, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: '{"id":0,"simulado":true}' })
  );

  await pagina.goto(`http://127.0.0.1:${puerto}/sonido`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await pagina.waitForTimeout(espera);

  // Toque real sobre el CTA del hero: genera pointerdown, la misma señal que
  // usa la variante diferida para adelantar la carga del contenedor.
  const destino = await pagina
    .evaluate(() => {
      const enlace = [...document.querySelectorAll("a[href]")].find((a) =>
        /wa\.me|api\.whatsapp\.com|whatsapp\.com\/send/i.test(a.getAttribute("href") || "")
      );
      if (!enlace) return null;
      const caja = enlace.getBoundingClientRect();
      return {
        x: Math.round(caja.x + caja.width / 2),
        y: Math.round(caja.y + caja.height / 2),
        alcanzable: caja.top >= 0 && caja.bottom <= innerHeight,
      };
    })
    .catch(() => null);

  if (destino && destino.alcanzable) await pagina.touchscreen.tap(destino.x, destino.y);

  // Margen amplio: si la conversión sale tarde, tiene que aparecer igual.
  await pagina.waitForTimeout(6000);
  await contexto.close();

  return {
    tocado: !!(destino && destino.alcanzable),
    gtm: gtm.length ? gtm[0] : null,
    navegacion,
    conversion: conversiones.length ? conversiones[0] : null,
  };
}

(async () => {
  const navegador = await chromium.launch();
  const resultados = {};

  console.log("Toque real sobre el CTA del hero de /sonido, que navega en la misma pestaña.");
  console.log(`${REPETICIONES} repeticiones por celda. Formato: navegación@ms / conversión@ms.`);
  console.log("Un guion en la conversión significa que la petición nunca llegó a salir.\n");

  const cabecera = "toque a  | " + Object.keys(RAMAS).map((r) => r.padEnd(28)).join("| ");
  console.log(cabecera);
  console.log("-".repeat(cabecera.length));

  for (const espera of INSTANTES) {
    const celdas = [];
    for (const [nombre, puerto] of Object.entries(RAMAS)) {
      const corridas = [];
      for (let i = 0; i < REPETICIONES; i++) corridas.push(await unaCorrida(navegador, puerto, espera));
      resultados[`${espera}|${nombre}`] = corridas;
      celdas.push(corridas.map((c) => `${c.navegacion ?? "—"}/${c.conversion ?? "—"}`).join("  "));
    }
    console.log(`${(espera + " ms").padEnd(9)}| ` + celdas.map((c) => c.padEnd(28)).join("| "));
  }

  console.log("\nDetalle de la carga de gtm.js (primer instante en que se pide):");
  for (const espera of INSTANTES) {
    const linea = Object.keys(RAMAS)
      .map((n) => {
        const v = resultados[`${espera}|${n}`].map((c) => c.gtm ?? "—").join(", ");
        return `${n}: ${v}`;
      })
      .join("  |  ");
    console.log(`  toque a ${String(espera).padStart(4)} ms  ->  ${linea}`);
  }

  const sinTocar = Object.entries(resultados).filter(([, cs]) => cs.some((c) => !c.tocado));
  console.log(
    "\nCeldas donde el CTA no era alcanzable en pantalla:",
    sinTocar.length ? sinTocar.map(([k]) => k).join(", ") : "ninguna"
  );

  await navegador.close();
})().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
