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
import { injectJsonLd, jsonLdScriptTag, siteUrlScript } from "./seo/jsonld";

export interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  STRATON_DB: D1Database;
  STRATON_KV: KVNamespace;
  STRATON_BUCKET: R2Bucket;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // API routes
    if (pathname.startsWith("/api/")) {
      return handleApi(request, env, pathname);
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
    const assetResponse = await env.ASSETS.fetch(request);
    const contentType = assetResponse.headers.get("Content-Type") || "";

    if (contentType.includes("text/html")) {
      if (page) {
        return injectDynamicPage(assetResponse, page, url.origin);
      }
      return injectJsonLd(assetResponse, url.origin);
    }

    return assetResponse;
  },
};

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

  const pageData = {
    title: page.title || null,
    meta_title: page.meta_title || null,
    meta_description: page.meta_description || null,
    content_json: contentJson,
  };

  // Escapar </ para que no rompa el <script> tag
  const safeJson = JSON.stringify(pageData).replace(/<\//g, "<\\/");
  const pageScript = `<script>window.__PAGE__ = ${safeJson};</script>`;
  const ldJson = jsonLdScriptTag();
  const siteScript = siteUrlScript(origin);

  class HeadHandler {
    element(element: Element) {
      element.append(ldJson, { html: true });
      element.append(pageScript, { html: true });
      element.append(siteScript, { html: true });
    }
  }

  // Clonar headers de la respuesta original pero asegurar Content-Type
  const headers = new Headers(response.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");

  return new HTMLRewriter()
    .on("head", new HeadHandler())
    .transform(new Response(response.body, { headers, status: response.status }));
}

async function handleApi(request: Request, env: Env, pathname: string): Promise<Response> {
  const method = request.method;

  // Rutas públicas (no requieren Cloudflare Access)
  const isPublic =
    (method === "POST" && pathname === "/api/quotations") ||
    (method === "GET" && pathname === "/api/settings") ||
    (method === "GET" && pathname.startsWith("/api/media/"));

  if (!isPublic && !validateAccess(request, env)) {
    return error("Unauthorized", 401);
  }

  // Dispatcher de rutas
  try {
    if (pathname.startsWith("/api/products")) {
      return await handleProducts(request, env, pathname);
    }

    if (pathname.startsWith("/api/quotations")) {
      return await handleQuotations(request, env, pathname);
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
      return await handleMedia(request, env, pathname);
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
