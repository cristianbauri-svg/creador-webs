/**
 * Banco de pruebas para el experimento de Google Tag Manager.
 *
 * Sirve stratonaudio.com.co tal cual, salvo el fragmento de GTM del HTML, que
 * sustituye por la variante que se le pida. Así las dos ramas del experimento
 * se miden con los mismos archivos, la misma red y el mismo contenedor real:
 * lo único que cambia entre una y otra es cuándo se inserta gtm.js.
 *
 * Producción no se toca en ningún momento.
 *
 *   node audit/experimento-gtm/proxy.mjs [--variante=actual|defer3s|deferload] [--puerto=8799]
 */
import http from "node:http";
import https from "node:https";
import { brotliCompressSync, constants as zlibConstants } from "node:zlib";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const AQUI = dirname(fileURLToPath(import.meta.url));
const ORIGEN = "stratonaudio.com.co";
const arg = (nombre, porDefecto) => {
  const encontrado = process.argv.find((a) => a.startsWith(`--${nombre}=`));
  return encontrado ? encontrado.slice(nombre.length + 3) : porDefecto;
};
const VARIANTE = arg("variante", "actual");
const PUERTO = Number(arg("puerto", 8799));

// El fragmento tal como está hoy en producción, delimitado por sus comentarios.
const FRAGMENTO_ACTUAL = /<!-- Google Tag Manager -->[\s\S]*?<!-- End Google Tag Manager -->/;

const snippetDefer = readFileSync(join(AQUI, "snippet-defer.html"), "utf8")
  .replace(/^<!--[\s\S]*?-->\s*/, "") // fuera la cabecera explicativa del archivo
  .trim();

/** Variante "deferload": igual que defer3s pero el contador de 3 s arranca
 *  cuando termina de cargar la página, no al parsear el fragmento. */
const snippetDeferLoad = snippetDefer.replace(
  "w.setTimeout(cargar,3000);",
  "if(d.readyState==='complete')w.setTimeout(cargar,3000);" +
    "else w.addEventListener('load',function(){w.setTimeout(cargar,3000)},{once:true});"
);

/** Variante "deferblank": el diferimiento más la mitigación que se propone
 *  para los CTA de WhatsApp. Hoy esos botones navegan en la misma pestaña, y
 *  el documento muere antes de que la conversión salga. Abriéndolos en una
 *  pestaña nueva la página sobrevive, el contenedor termina de cargar y la
 *  conversión se envía. En el banco de pruebas se simula con un script; en la
 *  implementación real iría en el renderizador de bloques. */
const PARCHE_PESTAÑA_NUEVA = `<script>
(function(){
  function marcar(){
    var enlaces=document.querySelectorAll('a[href*="wa.me"],a[href*="api.whatsapp.com"],a[href*="whatsapp.com/send"]');
    for(var k=0;k<enlaces.length;k++){
      if(!enlaces[k].target){enlaces[k].target='_blank';enlaces[k].rel='noopener noreferrer';}
    }
  }
  marcar();
  new MutationObserver(marcar).observe(document.documentElement,{childList:true,subtree:true});
})();
</script>`;

function transformarHtml(html) {
  if (VARIANTE === "actual") return html;
  const reemplazo = VARIANTE === "deferload" ? snippetDeferLoad : snippetDefer;
  if (VARIANTE === "deferblank") html = html.replace("</head>", PARCHE_PESTAÑA_NUEVA + "</head>");
  if (!FRAGMENTO_ACTUAL.test(html)) {
    console.error("  ¡aviso! no se encontró el fragmento de GTM en el HTML");
    return html;
  }
  return html.replace(
    FRAGMENTO_ACTUAL,
    "<!-- Google Tag Manager (variante experimental) -->\n" + reemplazo + "\n<!-- End Google Tag Manager -->"
  );
}

/** Pide un recurso al origen real devolviendo los bytes sin tocar. */
function pedirAlOrigen(ruta, cabeceras) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      { host: ORIGEN, path: ruta, method: "GET", headers: { ...cabeceras, host: ORIGEN } },
      (res) => {
        const trozos = [];
        res.on("data", (t) => trozos.push(t));
        res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, cuerpo: Buffer.concat(trozos) }));
      }
    );
    req.on("error", reject);
    req.end();
  });
}

const servidor = http.createServer(async (peticion, respuesta) => {
  try {
    const esDocumento = (peticion.headers.accept || "").includes("text/html");
    const cabecerasArriba = {
      accept: peticion.headers.accept || "*/*",
      "accept-language": peticion.headers["accept-language"] || "es",
      "user-agent": peticion.headers["user-agent"] || "experimento-gtm",
      // Para el documento pedimos texto plano y lo recomprimimos tras
      // transformarlo; el resto viaja tal cual llega.
      "accept-encoding": esDocumento ? "identity" : peticion.headers["accept-encoding"] || "identity",
    };

    const arriba = await pedirAlOrigen(peticion.url, cabecerasArriba);
    const tipo = String(arriba.headers["content-type"] || "");

    if (esDocumento && tipo.includes("text/html")) {
      const html = transformarHtml(arriba.cuerpo.toString("utf8"));
      const aceptaBr = (peticion.headers["accept-encoding"] || "").includes("br");
      const cuerpo = aceptaBr
        ? brotliCompressSync(Buffer.from(html, "utf8"), {
            params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 },
          })
        : Buffer.from(html, "utf8");

      const cabeceras = { ...arriba.headers };
      delete cabeceras["content-length"];
      delete cabeceras["content-encoding"];
      delete cabeceras["transfer-encoding"];
      // El CSP de producción permite 'self' y googletagmanager: sirve igual
      // desde este origen local porque el JavaScript propio también es 'self'.
      if (aceptaBr) cabeceras["content-encoding"] = "br";
      cabeceras["content-length"] = String(cuerpo.length);
      respuesta.writeHead(arriba.status, cabeceras);
      respuesta.end(cuerpo);
      return;
    }

    const cabeceras = { ...arriba.headers };
    delete cabeceras["transfer-encoding"];
    cabeceras["content-length"] = String(arriba.cuerpo.length);
    respuesta.writeHead(arriba.status, cabeceras);
    respuesta.end(arriba.cuerpo);
  } catch (e) {
    respuesta.writeHead(502, { "content-type": "text/plain" });
    respuesta.end("error de proxy: " + e.message);
  }
});

servidor.listen(PUERTO, "127.0.0.1", () => {
  console.log(`banco de pruebas en http://127.0.0.1:${PUERTO} — variante: ${VARIANTE}`);
});
