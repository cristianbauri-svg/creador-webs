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
import { injectJsonLd } from "./seo/jsonld";

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

    // Assets estáticos (sitio público + admin dashboard).
    // Con run_worker_first, env.ASSETS.fetch() obtiene el asset del CDN
    // de forma confiable, y el Worker siempre se ejecuta primero en HTML.
    const assetResponse = await env.ASSETS.fetch(request);
    const contentType = assetResponse.headers.get("Content-Type") || "";

    if (contentType.includes("text/html")) {
      return injectJsonLd(assetResponse);
    }

    return assetResponse;
  },
};

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
