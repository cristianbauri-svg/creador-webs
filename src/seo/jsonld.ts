/**
 * =============================================================================
 * JSON-LD para Straton Audio — PASO 1 DE ARRANQUE (presencia de entidad para IA)
 * =============================================================================
 *
 * QUÉ HACE:
 *   Genera un bloque <script type="application/ld+json"> con un @graph que
 *   describe la Organización, los 4 Servicios, los 4 Productos y los 3
 *   Paquetes que YA están confirmados como reales en la base de datos de
 *   producción (los mismos que loadServices()/loadProducts()/loadPackages()
 *   traen por JS), y lo inyecta en el <head> del HTML de respuesta usando
 *   HTMLRewriter — sin tocar la lógica existente del Worker ni el
 *   renderizado del resto del sitio.
 *
 * QUÉ NO HACE (léelo antes de asumir que esto resuelve todo):
 *   NO resuelve el Problema B (que servicios/productos/paquetes solo existan
 *   en el HTML después de ejecutar JS). Un crawler de IA ahora sabrá QUIÉN
 *   ERES, QUÉ HACES y EN QUÉ CIUDAD, con detalle de catálogo — pero el
 *   contenido narrativo alrededor (testimonios, portafolio) sigue sin ser
 *   visible hasta que se resuelva el renderizado del lado del servidor.
 *
 * ASUNCIONES QUE DEBES REVISAR ANTES DE DESPLEGAR (marcadas también inline
 * con "// ASUNCIÓN:"):
 *   1. `availability: InStock` en cada producto — es un valor por defecto
 *      razonable porque el sitio los presenta activamente, pero no refleja
 *      disponibilidad real en tiempo real. Ajusta si tienes esa lógica.
 *   2. No se incluye `price` en ningún Offer — no fue provisto, y no se debe
 *      inventar. Si quieres elegibilidad completa para "Product rich
 *      results" de Google más adelante, vas a necesitar precios reales.
 *   3. No se incluye `sameAs` (redes sociales) — los íconos del footer
 *      apuntan a "#", no a URLs reales todavía.
 *   4. No se incluye `geo` (coordenadas) ni `streetAddress` — el sitio solo
 *      confirma ciudad (Bogotá, Colombia), no dirección física.
 *   5. El teléfono se normalizó a formato E.164 (+5712345678) a partir de
 *      "+57 (1) 234 5678" mostrado en el sitio. Verifica que sea correcto.
 * =============================================================================
 */

const SITE_URL = "https://stratonaudio.com.co";
const ORG_ID = `${SITE_URL}/#organization`;

// -----------------------------------------------------------------------------
// DATOS FUENTE — copiados de la extracción de base de datos que confirmaste.
// Si el contenido cambia en el dashboard, actualiza esto también, o mejor:
// reemplaza estos arreglos por una consulta real a D1 en el propio Worker
// (ver nota "SIGUIENTE PASO" al final del archivo).
// -----------------------------------------------------------------------------

const SERVICIOS = [
  {
    id: "servicio-audio-profesional",
    nombre: "Audio Profesional",
    descripcion:
      "Ponemos a su disposición sistemas de audio e iluminación para que sus eventos sean del más alto nivel y crear experiencias inolvidables. Sistemas disponibles para audiencias de 50, 100 a 500, y 2000 a 5000 personas.",
    imagen:
      "https://stratonaudio.com.co/api/media/products/e0828ed7-00f3-4b44-b323-d64ad97694b9.webp",
  },
  {
    id: "servicio-pantallas-led",
    nombre: "Pantallas LED",
    descripcion:
      "Destaca tus eventos proyectando el contenido que impactará a tu audiencia. Pantallas HD de gran formato y pantallas 360°, en formatos 1:1, 4:3 y 16:9.",
    imagen:
      "https://stratonaudio.com.co/api/media/products/b50dd781-95c8-45ed-bcdb-a1bbf0619914.webp",
  },
  {
    id: "servicio-iluminacion",
    nombre: "Iluminación",
    descripcion:
      "El factor más importante de un evento es la dinámica lumínica de un escenario. Disponibilidad de Par LED, cabezas móviles (Beam, Spots, Gobos), strobers, derbys, blinders, y luces cálidas y frías para escenarios.",
    imagen:
      "https://stratonaudio.com.co/api/media/products/25bc6cb3-7230-4c3c-9697-67cfdcd80fb9.webp",
  },
  {
    id: "servicio-streaming-cctv",
    nombre: "Streaming y Circuito Cerrado de TV",
    descripcion:
      "Expertos en la transmisión vía internet de eventos corporativos a través de las plataformas de video más reconocidas. Transmisiones en vivo Full HD, con cámaras profesionales 4K y 1080p.",
    imagen:
      "https://stratonaudio.com.co/api/media/products/f779e967-4f94-496d-ab53-4db5a2f421f3.webp",
  },
];

// businessFunction: "LeaseOut" (alquiler) o "Sell" (venta) — tomado literal de
// lo que confirmaste, sin inventar oferta dual donde el dato no la sustenta.
const PRODUCTOS = [
  {
    id: "producto-line-array",
    nombre: "Line Array",
    categoria: "Audio",
    businessFunction: "LeaseOut",
    descripcion:
      "Sistemas de audio Line Array para eventos de cualquier tamaño, proporcionando un sonido potente, uniforme y de alta fidelidad. Incluye consolas digitales, microfonía inalámbrica, subwoofers, monitores de escenario, ingeniero de sonido, pruebas de sonido, montaje y desmontaje. DB Technology, 2000W por caja, subwoofers dobles 4500W, estructura de colgado.",
    imagen:
      "https://stratonaudio.com.co/api/media/products/6c5908f4-0d0a-4e1f-9e7b-5f29260d5b12.webp",
  },
  {
    id: "producto-pantallas-led",
    nombre: "Pantallas LED",
    categoria: "Pantallas LED",
    businessFunction: "LeaseOut",
    descripcion:
      "Pantallas LED modulares de última generación, adaptables a cualquier evento. Incluye transporte, instalación, configuración, operación técnica y desmontaje. Pixel pitch desde P2.9, instalación indoor y outdoor, alto brillo superior a 5000 nits, compatible con HDMI, SDI e inalámbrico, resolución Full HD y 4K.",
    imagen:
      "https://stratonaudio.com.co/api/media/products/38eb5d39-c4aa-415b-bda1-3597fc913a6d.webp",
  },
  {
    id: "producto-luces-robotizadas",
    nombre: "Luces Robotizadas",
    categoria: "Iluminación",
    businessFunction: "Sell",
    descripcion:
      "Soluciones de iluminación profesional con equipos de última generación y control DMX. Incluye instalación, programación, operación y desmontaje. Control DMX profesional, luces robóticas y cabezas móviles, barras LED RGBW y luces Wash, efectos especiales (humo, láser, confeti), diseño de iluminación personalizado.",
    imagen:
      "https://stratonaudio.com.co/api/media/products/66ab4fda-58bd-4f97-8aba-63e65e642abd.webp",
  },
  {
    id: "producto-consola",
    nombre: "Consola",
    categoria: "Audio",
    businessFunction: "LeaseOut",
    descripcion:
      "Alquiler de consolas digitales profesionales (Behringer WING, X32, Midas M32, XR18) con configuración, instalación y soporte técnico incluidos. Desde 16 hasta 48 canales, medusas digitales, ingeniero de audio incluido.",
    imagen:
      "https://stratonaudio.com.co/api/media/products/5ba89932-06c0-462a-b3b0-55348178ddd2.webp",
  },
];

// `incluye`: cada ítem se traduce a un TypeAndQuantityNode.
// tipo: "Thing" (equipo/artículo físico) o "Service" (mano de obra/logística).
const PAQUETES = [
  {
    id: "paquete-basic-sound",
    nombre: "Straton Basic Sound",
    descripcion: "Ideal para eventos pequeños o reuniones privadas.",
    incluye: [
      { cantidad: 2, tipo: "Thing", nombre: "Cabina activa profesional" },
      { tipo: "Service", nombre: "DJ profesional en vivo" },
      { cantidad: 1, tipo: "Thing", nombre: "Micrófono inalámbrico" },
      { tipo: "Thing", nombre: "Controlador DJ profesional" },
      { tipo: "Service", nombre: "Transporte y montaje" },
      { tipo: "Service", nombre: "Operador técnico" },
    ],
  },
  {
    id: "paquete-mini-party",
    nombre: "Straton Mini Party",
    descripcion: "Para celebraciones pequeñas con ambiente de fiesta.",
    incluye: [
      { tipo: "Thing", nombre: "Sistema de sonido profesional" },
      { tipo: "Service", nombre: "DJ profesional en vivo" },
      { cantidad: 1, tipo: "Thing", nombre: "Micrófono inalámbrico" },
      { cantidad: 1, tipo: "Thing", nombre: "Micrófono de cable" },
      {
        tipo: "Thing",
        nombre: "Iluminación básica (luces audio-rítmicas, láser, strober)",
      },
      { tipo: "Thing", nombre: "Cámara de humo" },
      { tipo: "Thing", nombre: "Estructura tipo T" },
      { cantidad: 4, tipo: "Thing", nombre: "Reflector LED" },
      { tipo: "Service", nombre: "Transporte y montaje" },
    ],
  },
  {
    id: "paquete-gold-experience",
    nombre: "Straton Gold Experience",
    descripcion:
      "Experiencia premium con show y producción completa. Más solicitado. No incluye backline para orquestas o grupos musicales.",
    incluye: [
      { tipo: "Thing", nombre: "Sistema Line Array profesional" },
      { tipo: "Thing", nombre: "Bajos activos de alto impacto" },
      { tipo: "Thing", nombre: "Consola digital" },
      { tipo: "Thing", nombre: "Micrófonos inalámbricos SHURE", marca: "SHURE" },
      { tipo: "Service", nombre: "DJ profesional" },
      {
        tipo: "Thing",
        nombre: "Iluminación avanzada (cabezas móviles, láser, LED)",
      },
      { tipo: "Thing", nombre: "Cámara de humo y efectos" },
      { tipo: "Service", nombre: "Iluminación ambiental del salón" },
      { tipo: "Thing", nombre: "Estructura TRUSS" },
      { tipo: "Service", nombre: "Staff técnico completo" },
    ],
  },
];

// -----------------------------------------------------------------------------
// CONSTRUCCIÓN DEL GRAFO
// -----------------------------------------------------------------------------

function buildOrganization() {
  return {
    "@type": ["Organization", "LocalBusiness"],
    "@id": ORG_ID,
    name: "Straton Audio",
    url: SITE_URL,
    description:
      "Soluciones profesionales en audio e iluminación para eventos corporativos, sociales y conciertos. Alquiler y venta de equipos de alta calidad.",
    // ASUNCIÓN: teléfono normalizado a E.164 desde "+57 310 2646751".
    telephone: "+573102646751",
    email: "eventos@stratonaudio.com.co",
    address: {
      "@type": "PostalAddress",
      addressLocality: "Bogotá",
      addressCountry: "CO",
    },
    areaServed: {
      "@type": "City",
      name: "Bogotá",
    },
    // ASUNCIÓN: formato schema.org (día abreviado + rango 24h) a partir de
    // "Lun - Sáb: 8:00 AM - 6:00 PM".
    openingHours: "Mo-Sa 08:00-18:00",
    knowsAbout: [
      "Audio profesional para eventos",
      "Alquiler de equipos de audio",
      "Venta de equipos de audio",
      "Pantallas LED para eventos",
      "Iluminación profesional y control DMX",
      "Streaming y transmisión de eventos en vivo",
      "Producción técnica de eventos corporativos y sociales",
    ],
    makesOffer: [
      ...SERVICIOS.map((s) => ({ "@id": `${SITE_URL}/#${s.id}` })),
      ...PRODUCTOS.map((p) => ({ "@id": `${SITE_URL}/#${p.id}` })),
      ...PAQUETES.map((pk) => ({ "@id": `${SITE_URL}/#${pk.id}` })),
    ],
  };
}

function buildServiceNode(s: (typeof SERVICIOS)[number]) {
  return {
    "@type": "Service",
    "@id": `${SITE_URL}/#${s.id}`,
    name: s.nombre,
    description: s.descripcion,
    image: s.imagen,
    provider: { "@id": ORG_ID },
    areaServed: { "@type": "City", name: "Bogotá" },
  };
}

function buildProductNode(p: (typeof PRODUCTOS)[number]) {
  const businessFunctionUrl =
    p.businessFunction === "Sell"
      ? "http://purl.org/goodrelations/v1#Sell"
      : "http://purl.org/goodrelations/v1#LeaseOut";
  const offerType = p.businessFunction === "Sell" ? "Offer" : "OfferForLease";

  return {
    "@type": "Product",
    "@id": `${SITE_URL}/#${p.id}`,
    name: p.nombre,
    category: p.categoria,
    description: p.descripcion,
    image: p.imagen,
    brand: { "@type": "Brand", name: "Straton Audio" },
    offers: {
      "@type": offerType,
      businessFunction: businessFunctionUrl,
      seller: { "@id": ORG_ID },
      // ASUNCIÓN: no hay dato real de inventario; se marca InStock porque
      // el producto se presenta activamente. Ajustar si hay lógica real.
      availability: "https://schema.org/InStock",
      // Sin `price` — no fue provisto, no se inventa.
    },
  };
}

function buildPackageNode(pk: (typeof PAQUETES)[number]) {
  const includesObject = pk.incluye.map((item: { cantidad?: number; tipo: string; nombre: string; marca?: string }) => {
    const typeOfGood: Record<string, unknown> = {
      "@type": item.tipo,
      name: item.nombre,
    };
    if (item.marca) {
      typeOfGood.brand = { "@type": "Brand", name: item.marca };
    }
    const node: Record<string, unknown> = { "@type": "TypeAndQuantityNode", typeOfGood };
    if (item.cantidad) node.amountOfThisGood = item.cantidad;
    return node;
  });

  return {
    "@type": "Service",
    "@id": `${SITE_URL}/#${pk.id}`,
    name: pk.nombre,
    description: pk.descripcion,
    provider: { "@id": ORG_ID },
    areaServed: { "@type": "City", name: "Bogotá" },
    offers: {
      "@type": "Offer",
      businessFunction: "http://purl.org/goodrelations/v1#LeaseOut",
      seller: { "@id": ORG_ID },
      includesObject,
      // Sin `price` — no fue provisto, no se inventa.
    },
  };
}

export function buildJsonLdGraph() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      buildOrganization(),
      ...SERVICIOS.map(buildServiceNode),
      ...PRODUCTOS.map(buildProductNode),
      ...PAQUETES.map(buildPackageNode),
    ],
  };
}

export function jsonLdScriptTag(): string {
  const data = buildJsonLdGraph();
  // JSON.stringify sin indentar: menos bytes en el HTML de respuesta.
  return `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
}

/**
 * Genera un <script> que expone el origen actual de la solicitud para que
 * el frontend pueda reescribir enlaces internos hardcodeados a producción.
 */
export function siteUrlScript(origin: string): string {
  // Escapar caracteres peligrosos para prevenir XSS vía Host header:
  // - Comillas dobles romperían el string literal JS
  // - "</script>" cerraría prematuramente el tag <script>
  // - Backslash podría usarse para evadir los escapes anteriores
  const safe = origin
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/</g, "\\x3c");
  return `<script>window.__SITE_URL__ = "${safe}";</script>`;
}

/**
 * Inyección quirúrgica: añade el script JSON-LD y la URL del sitio
 * justo antes de que cierre el <head>, sin tocar ningún otro nodo del
 * documento ni la lógica de renderizado existente.
 */
export function injectJsonLd(response: Response, origin: string): Response {
  class HeadHandler {
    element(element: Element) {
      element.append(jsonLdScriptTag(), { html: true });
      element.append(siteUrlScript(origin), { html: true });
    }
  }
  return new HTMLRewriter().on("head", new HeadHandler()).transform(response);
}

/**
 * SIGUIENTE PASO (no para este paso 1, pero queda anotado):
 * Cuando ataquen el Problema B, esta misma función `buildJsonLdGraph()`
 * debería dejar de leer de arreglos estáticos (SERVICIOS/PRODUCTOS/PAQUETES)
 * y leer directamente de D1 con las mismas queries que ya usan
 * loadServices()/loadProducts()/loadPackages() — así el JSON-LD nunca queda
 * desincronizado del contenido real, sin mantenimiento manual.
 */
