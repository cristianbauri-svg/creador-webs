// Straton Audio — Worker API
// Sirve la API (/api/*) y delega el resto a los assets estáticos
// Los assets /admin/* viven en public/admin/ y son servidos como estáticos
// Cloudflare Access protege /admin* a nivel de ruta en producción

import { error } from "./utils/response";
import { validateAccess } from "./middleware/auth";
import { handleProducts } from "./routes/products";
import { handleQuotations } from "./routes/quotations";
import { handleServices } from "./routes/services";
import { handlePackages } from "./routes/packages";
import { handleEvents } from "./routes/events";
import { handleTestimonials } from "./routes/testimonials";
import { handlePages } from "./routes/pages";
import { handleSettings } from "./routes/settings";
import { handleUpload } from "./routes/upload";
import { handleMedia } from "./routes/media";
import { injectJsonLd, pageJsonLdScriptTag, siteUrlScript, type PageContext } from "./seo/jsonld";
import { handleSitemap } from "./seo/sitemap";

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  STRATON_DB: D1Database;
  STRATON_KV: KVNamespace;
  STRATON_BUCKET: R2Bucket;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  ENVIRONMENT: string;
  CF_ACCESS_TEAM_DOMAIN: string;
  CF_ACCESS_AUD: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // API routes
    if (pathname.startsWith("/api/")) {
      return handleApi(request, env, pathname, ctx);
    }

    // Sitemap XML dinámico — se resuelve con D1 en cada request, no es un
    // archivo estático, así que se intercepta antes del flujo de assets.
    if (pathname === "/sitemap.xml") {
      return handleSitemap(env, url.origin);
    }

    // Páginas dinámicas: buscar slug en D1 antes de servir assets.
    // Solo para requests HTML — evita una consulta D1 en cada asset estático.
    const accept = request.headers.get("Accept") || "";
    const isHTMLRequest = accept.includes("text/html") || pathname === "/" || !pathname.includes(".");
    const slug = pathname.replace(/^\/+/, "").trim();
    let page: Record<string, unknown> | null = null;
    if (slug && isHTMLRequest) {
      try {
        page = await env.STRATON_DB.prepare(
          "SELECT * FROM pages WHERE slug = ? AND status = 'published'"
        ).bind(slug).first();
      } catch (e) {
        console.error("Error buscando página:", e);
      }
    }

    // Assets estáticos (sitio público + admin dashboard).
    // Con run_worker_first, env.ASSETS.fetch() obtiene el asset del CDN
    // de forma confiable, y el Worker siempre se ejecuta primero en HTML.
    //
    // Si hay página dinámica, pedimos explícitamente el shell de "/" (index.html,
    // un archivo real) en vez de la ruta del slug — el slug nunca coincide con
    // un archivo estático, y con not_found_handling: "404-page" eso devolvería
    // 404.html en vez del shell necesario para inyectar window.__PAGE__.
    const assetResponse = page
      ? await env.ASSETS.fetch(new Request(new URL("/", request.url), request))
      : await env.ASSETS.fetch(request);
    const contentType = assetResponse.headers.get("Content-Type") || "";

    if (contentType.includes("text/html")) {
      if (page) {
        return injectDynamicPage(assetResponse, page, url.origin);
      }
      if (pathname === "/admin/" || pathname === "/admin/index.html") {
        const adminEmail = request.headers.get("Cf-Access-Authenticated-User-Email");
        return injectAdminEmail(injectJsonLd(assetResponse, url.origin), adminEmail);
      }
      return injectJsonLd(assetResponse, url.origin);
    }

    return assetResponse;
  },
};

/**
 * Inyecta window.__ADMIN_EMAIL__ con el email autenticado por Cloudflare
 * Access (header Cf-Access-Authenticated-User-Email, no falsificable por un
 * cliente externo — Cloudflare lo sobrescribe en el edge). null si el header
 * no está presente (desarrollo local, o si Access no está configurado sobre
 * la ruta).
 */
function injectAdminEmail(response: Response, email: string | null): Response {
  const safeEmail = email ? JSON.stringify(email) : "null";
  const script = `<script>window.__ADMIN_EMAIL__ = ${safeEmail};</script>`;

  class HeadHandler {
    element(element: Element) {
      element.append(script, { html: true });
    }
  }

  return new HTMLRewriter().on("head", new HeadHandler()).transform(response);
}

// =========================================================
// Server-render del hero dinámico (páginas de D1)
// =========================================================

/** Escapa texto para uso dentro de HTML (contenido de texto). */
function escapeHtmlText(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Escapa un valor para usarlo como atributo HTML. Bloquea javascript:/data:. */
function escapeAttrValue(value: unknown): string {
  const str = String(value ?? "").trim();
  if (/^(javascript|data):/i.test(str)) return "#";
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Espejo de btnStyleClass() en public/js/app.js. */
function btnStyleClassServer(style: unknown): string {
  if (style === "2") return "btn-style-whatsapp";
  if (style === "3") return "btn-style-neon";
  return "";
}

/** ¿El ojo de visibilidad está abierto? `undefined` cuenta como abierto, para
 *  no alterar el comportamiento de los bloques creados antes de que existieran
 *  los ojos. Solo `false` lo cierra. */
function eyeVisibleServer(value: unknown): boolean {
  return value !== false && value !== "false";
}

/** Resuelve qué imagen corresponde a cada dispositivo cuando el bloque tiene
 *  dos slots (Horizontal / Vertical) con un ojo de visibilidad por dispositivo
 *  en cada slot. Desktop prefiere el slot Horizontal; móvil, el Vertical; si el
 *  preferido está oculto o vacío, cae al otro. Devuelve "" cuando ese
 *  dispositivo no debe mostrar imagen.
 *
 *  Espejo de resolveSlotImages() en public/js/app.js. */
function resolveSlotImages(slot: {
  horizontal: unknown;
  horizontalDesktop: unknown;
  horizontalMobile: unknown;
  vertical: unknown;
  verticalDesktop: unknown;
  verticalMobile: unknown;
}): { desktop: string; mobile: string } {
  const h = typeof slot.horizontal === "string" ? slot.horizontal.trim() : "";
  const v = typeof slot.vertical === "string" ? slot.vertical.trim() : "";
  const desktop =
    eyeVisibleServer(slot.horizontalDesktop) && h
      ? h
      : eyeVisibleServer(slot.verticalDesktop) && v
        ? v
        : "";
  const mobile =
    eyeVisibleServer(slot.verticalMobile) && v
      ? v
      : eyeVisibleServer(slot.horizontalMobile) && h
        ? h
        : "";
  return { desktop, mobile };
}

/** Markup <picture> para una imagen con variante móvil. El <source> con
 *  media="(max-width: 768px)" hace que el navegador descargue solo la variante
 *  que le corresponde. Si `desktop` está vacío el <img> sale sin src: ese
 *  dispositivo no muestra imagen, pero el móvil sí gracias al <source>. Si
 *  ambas URLs coinciden no se emite <source>, para no duplicar el markup.
 *
 *  Espejo de pictureHtml() en public/js/app.js. */
function pictureHtml(cfg: {
  desktop: string;
  mobile: string;
  className?: string;
  alt?: string;
  extraAttrs?: string;
}): string {
  const desktop = cfg.desktop || "";
  const mobile = cfg.mobile || "";
  let html = "<picture>";
  if (mobile && mobile !== desktop) {
    html += `<source media="(max-width: 768px)" srcset="${escapeAttrValue(mobile)}">`;
  }
  html += "<img";
  if (desktop) html += ` src="${escapeAttrValue(desktop)}"`;
  if (cfg.className) html += ` class="${cfg.className}"`;
  html += ` alt="${escapeHtmlText(cfg.alt || "")}"`;
  if (cfg.extraAttrs) html += ` ${cfg.extraAttrs}`;
  return html + "></picture>";
}

/** Espejo exacto de renderHero() en public/js/app.js, pero server-side.
 *  Produce el mismo markup (clases e inline styles) para que el CSS aplicado
 *  sea idéntico al del render client-side. */

// Un color solo se acepta con la forma que produce el selector del panel
// (#rgb, #rgba, #rrggbb, #rrggbbaa). Mismo filtro que COLOR_HEX en
// public/js/app.js. Un acierto no puede contener comillas ni ';', así que el
// valor validado se puede interpolar sin escapar.
const COLOR_HEX = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function hexColor(value: unknown): string {
  return typeof value === "string" && COLOR_HEX.test(value) ? value : "";
}

function renderHeroHtml(props: Record<string, unknown>): string {
  const isVideo = props.bg_type === "video" && props.bg_url;
  let bgEl: string;

  if (isVideo) {
    bgEl = `<video class="hero-bg-video" autoplay muted loop playsinline><source src="${escapeAttrValue(props.bg_url)}" type="video/mp4"></video>`;
  } else {
    // Dos slots (Horizontal / Vertical) con un ojo de visibilidad por
    // dispositivo en cada uno → una sola imagen por dispositivo.
    const heroImg = resolveSlotImages({
      horizontal: props.bg_url,
      horizontalDesktop: props.bg_url_visible_desktop,
      horizontalMobile: props.bg_url_visible_mobile,
      vertical: props.bg_url_mobile,
      verticalDesktop: props.bg_url_mobile_visible_desktop,
      verticalMobile: props.bg_url_mobile_visible_mobile,
    });
    const picture =
      heroImg.desktop || heroImg.mobile
        ? pictureHtml({
            desktop: heroImg.desktop,
            mobile: heroImg.mobile,
            extraAttrs: 'fetchpriority="high" decoding="async"',
          })
        : "";
    bgEl = `<div class="hero-bg-sticky">${picture}</div>`;
  }

  const heading = props.title ? `<h1>${escapeHtmlText(props.title)}</h1>` : "";
  const sub = props.subtitle ? `<p>${escapeHtmlText(props.subtitle)}</p>` : "";
  const button = props.button_text
    ? `<a href="${escapeAttrValue(props.button_link || "#")}" class="btn-hero ${btnStyleClassServer(props.button_style)}">${escapeHtmlText(props.button_text)}</a>`
    : "";

  // Mismos estilos en línea que aplica el cliente (applyBlockMargins en
  // public/js/app.js) para que el hero no salte de sitio cuando app.js
  // re-renderiza el bloque. Sin márgenes la salida es idéntica a la de antes.
  const heroStyles: string[] = [];
  // El hero ya ocupa el ancho completo de la ventana por su propia regla CSS
  // (.dynamic-block.block-hero en styles.css: width:100vw + margin-left
  // calc(-50vw + 50%)), así que aquí solo se pinta el fondo: no lleva el
  // tratamiento de applyFullBleed() que sí usan los demás bloques.
  if (props.bg_color) heroStyles.push(`background:${escapeAttrValue(props.bg_color)}`);
  // Colores de título y texto elegidos en el panel. Se publican como variables
  // CSS y las leen las reglas del hero (index.html), igual que hace
  // applyBlockTextColors() en public/js/app.js para el resto de los bloques.
  const heroTitleColor = hexColor(props.title_color);
  const heroTextColor = hexColor(props.text_color);
  if (heroTitleColor) heroStyles.push(`--block-title-color:${heroTitleColor}`, "--block-title-opacity:1");
  if (heroTextColor) heroStyles.push(`--block-text-color:${heroTextColor}`);
  const marginTop = props.margin_top ? parseInt(String(props.margin_top), 10) : NaN;
  const marginBottom = props.margin_bottom ? parseInt(String(props.margin_bottom), 10) : NaN;
  if (!Number.isNaN(marginTop)) heroStyles.push(`margin-top:${marginTop}px`);
  if (!Number.isNaN(marginBottom)) heroStyles.push(`margin-bottom:${marginBottom}px`);
  if (!Number.isNaN(marginTop) || !Number.isNaN(marginBottom)) {
    // Un margen negativo necesita apilar por encima del bloque vecino.
    heroStyles.push("position:relative", "z-index:1");
  }
  const heroStyle = heroStyles.length ? ` style="${heroStyles.join(";")};"` : "";

  return (
    `<section class="dynamic-block block-hero"${heroStyle}>` +
    bgEl +
    `<div class="hero-overlay"></div>` +
    `<div class="hero-content">${heading}${sub}${button}</div>` +
    `</section>`
  );
}

/** Encuentra el primer bloque hero con título no vacío y lo renderiza. */
function buildServerHero(contentJson: Record<string, unknown>): string {
  const blocks = Array.isArray(contentJson) ? contentJson : [];
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const b = block as { type?: unknown; props?: unknown };
    if (b.type !== "hero" || !b.props || typeof b.props !== "object") continue;
    const props = b.props as Record<string, unknown>;
    if (props.title) return renderHeroHtml(props);
  }
  return "";
}

/** Oculta el contenido de la landing (home) y muestra la página dinámica.
 *  Aplicado server-side para que no haya parpadeo de la home antes de que
 *  app.js corra, y para que el HTML sin JS ya no muestre la home. */
const HIDE_LANDING_STYLE =
  `<style>` +
  `#hero,#statsBanner,#servicios,#productos,#paquetes,#portafolio,#testimonios,#contacto,` +
  `.logo-marquee,.eq-console,.cart-toggle,.whatsapp-float,#cart-bar{display:none!important}` +
  `#dynamic-page{display:block!important}` +
  `</style>`;

/**
 * Inyecta window.__PAGE__ con los datos de la página dinámica, el JSON-LD
 * SEO y window.__SITE_URL__ en el <head> del HTML. Usa HTMLRewriter para
 * no consumir el stream innecesariamente.
 */
function injectDynamicPage(response: Response, page: Record<string, unknown>, origin: string): Response {
  let contentJson: Record<string, unknown> = {};
  if (page.content_json && typeof page.content_json === "string") {
    try {
      contentJson = JSON.parse(page.content_json);
    } catch { /* JSON inválido — se usa objeto vacío */ }
  }

  // Fondo de página: el canvas detrás de los bloques (el espacio entre uno y
  // otro). Mismo convenio que el bg_color de los bloques — valor libre escrito
  // con el shorthand `background`, así acepta color sólido y degradado CSS.
  // Vacío = sin fondo propio: la página se ve sobre el fondo del body, igual
  // que antes de existir este campo.
  const pageBgColor = typeof page.bg_color === "string" ? page.bg_color.trim() : "";

  const pageData = {
    title: page.title || null,
    meta_title: page.meta_title || null,
    meta_description: page.meta_description || null,
    bg_color: pageBgColor || null,
    content_json: contentJson,
  };

  // Hero renderizado server-side (punto 1): se inyecta en #dynamic-page.
  const serverHero = buildServerHero(contentJson);

  // Escapar </ para que no rompa el <script> tag
  const safeJson = JSON.stringify(pageData).replace(/<\//g, "<\\/");
  const pageScript = `<script>window.__PAGE__ = ${safeJson};</script>`;

  // Grafo JSON-LD específico de la página (WebSite + WebPage + Service +
  // BreadcrumbList enlazados a la Organization). Usa solo datos de D1.
  const slug = String(page.slug || "").trim();
  const pageContext: PageContext = {
    slug,
    title: typeof page.title === "string" ? page.title : null,
    meta_title: typeof page.meta_title === "string" ? page.meta_title : null,
    meta_description: typeof page.meta_description === "string" ? page.meta_description : null,
  };
  const ldJson = pageJsonLdScriptTag(pageContext, origin);
  const siteScript = siteUrlScript(origin);

  // SEO on-page server-side: title, meta description, canonical y Open Graph
  // específicos de la página. Así el HTML crudo (sin ejecutar JS) ya trae los
  // valores correctos para crawlers, redes sociales y agentes.
  const seoTitle = pageContext.meta_title || pageContext.title || null;
  const seoDescription = pageContext.meta_description || null;
  const canonicalUrl = slug ? `${origin}/${slug}` : origin;

  class HeadHandler {
    element(element: Element) {
      element.append(ldJson, { html: true });
      element.append(pageScript, { html: true });
      element.append(siteScript, { html: true });
      element.append(HIDE_LANDING_STYLE, { html: true });
      element.append(`<link rel="canonical" href="${canonicalUrl}" />`, { html: true });
    }
  }

  // Renderiza el primer hero de la página dentro del contenedor dinámico y lo
  // muestra, para que el HTML inicial ya traiga el contenido de la landing
  // (H1, subtítulo y CTA) en lugar de la home. app.js luego lo re-renderiza.
  class DynamicPageHandler {
    element(element: Element) {
      element.setInnerContent(serverHero, { html: true });
      element.setAttribute("style", "display:block;");
    }
  }

  // El fondo de página va en <body> y no en #dynamic-page: ese contenedor es
  // una columna centrada de 960px, así que un fondo puesto ahí dejaría los
  // costados sin pintar. En <body> cubre el ancho completo de la ventana.
  // Sin valor no se toca el <body>, que queda igual que antes de este campo.
  class BodyBackgroundHandler {
    element(element: Element) {
      if (!pageBgColor) return;
      element.setAttribute("style", `background:${escapeAttrValue(pageBgColor)}`);
    }
  }

  // Elimina el hero de la home (que incluye el <video> autoplay) para que no
  // se descargue ni muestre en las páginas dinámicas. También evita el H1
  // duplicado de la home en el HTML crudo.
  class HomeHeroRemovalHandler {
    element(element: Element) {
      element.remove();
    }
  }

  class TitleHandler {
    element(element: Element) {
      if (seoTitle) element.setInnerContent(seoTitle);
    }
  }

  class MetaDescriptionHandler {
    element(element: Element) {
      if (seoDescription) element.setAttribute("content", seoDescription);
    }
  }

  class OgTitleHandler {
    element(element: Element) {
      if (seoTitle) element.setAttribute("content", seoTitle);
    }
  }

  class OgDescriptionHandler {
    element(element: Element) {
      if (seoDescription) element.setAttribute("content", seoDescription);
    }
  }

  class OgUrlHandler {
    element(element: Element) {
      element.setAttribute("content", canonicalUrl);
    }
  }

  // Clonar headers de la respuesta original pero asegurar Content-Type
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");

  // Las páginas dinámicas no deben cachearse: el shell HTML es un asset
  // estático (con su propio ETag/Cache-Control), pero el contenido inyectado
  // aquí cambia por request según D1. Reusar el ETag del asset causaría que
  // el navegador (o el edge de Cloudflare) sirva un body viejo en un 304
  // aunque el content_json ya haya cambiado.
  headers.set("Cache-Control", "no-cache, max-age=0, must-revalidate");
  headers.delete("ETag");
  headers.delete("If-None-Match");

  return new HTMLRewriter()
    .on("head", new HeadHandler())
    .on("title", new TitleHandler())
    .on('meta[name="description"]', new MetaDescriptionHandler())
    .on('meta[property="og:title"]', new OgTitleHandler())
    .on('meta[property="og:description"]', new OgDescriptionHandler())
    .on('meta[property="og:url"]', new OgUrlHandler())
    .on("#dynamic-page", new DynamicPageHandler())
    .on("body", new BodyBackgroundHandler())
    .on("#hero", new HomeHeroRemovalHandler())
    .transform(new Response(response.body, { headers, status: response.status }));
}

async function handleApi(request: Request, env: Env, pathname: string, ctx: ExecutionContext): Promise<Response> {
  const method = request.method;
  const isMutation = method === "POST" || method === "PUT" || method === "DELETE";

  // Rutas protegidas: requieren autenticación real de Cloudflare Access.
  // Todo lo demás mantiene su comportamiento actual (público).
  const isProtected =
    (isMutation && pathname.startsWith("/api/pages")) ||
    (isMutation && pathname.startsWith("/api/products")) ||
    (isMutation && pathname.startsWith("/api/services")) ||
    (isMutation && pathname.startsWith("/api/packages")) ||
    (isMutation && pathname.startsWith("/api/testimonials")) ||
    (isMutation && pathname === "/api/upload") ||
    (method === "GET" && pathname.startsWith("/api/quotations")) ||
    (method === "PUT" && pathname === "/api/settings");

  if (isProtected && !(await validateAccess(request, env))) {
    return error("Unauthorized", 401);
  }

  // Dispatcher de rutas
  try {
    if (pathname.startsWith("/api/products")) {
      return await handleProducts(request, env, pathname);
    }

    if (pathname.startsWith("/api/quotations")) {
      return await handleQuotations(request, env, pathname, ctx);
    }

    if (pathname.startsWith("/api/services")) {
      return await handleServices(request, env, pathname);
    }

    if (pathname.startsWith("/api/packages")) {
      return await handlePackages(request, env, pathname);
    }

    if (pathname.startsWith("/api/events")) {
      return await handleEvents(request, env, pathname);
    }

    if (pathname.startsWith("/api/testimonials")) {
      return await handleTestimonials(request, env, pathname);
    }

    if (pathname.startsWith("/api/pages")) {
      return await handlePages(request, env, pathname);
    }

    if (pathname.startsWith("/api/settings")) {
      return await handleSettings(request, env, pathname);
    }

    if (pathname.startsWith("/api/media/")) {
      return await handleMedia(request, env, pathname, ctx);
    }

    if (pathname === "/api/upload") {
      return await handleUpload(request, env);
    }

    return error("Not found", 404);
  } catch (e) {
    console.error("API error:", e);
    return error("Internal server error", 500);
  }
}
