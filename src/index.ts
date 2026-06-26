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

export interface Env {
  STRATON_DB: D1Database;
  STRATON_KV: KVNamespace;
  STRATON_BUCKET: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // API routes
    if (pathname.startsWith("/api/")) {
      return handleApi(request, env, pathname);
    }

    // Assets estáticos (sitio público + admin dashboard)
    // Usar fetch directo en vez de env.ASSETS.fetch() por confiabilidad
    const assetResponse = await fetch(request, {
      cf: {
        rocket_loader: false,
        minify: false,
      },
    });

    // Agregar charset=utf-8 según extensión para evitar mojibake
    const contentType = getContentType(pathname);
    if (contentType) {
      const headers = new Headers(assetResponse.headers);
      if (!headers.has("Content-Type") || !headers.get("Content-Type")!.includes("charset")) {
        headers.set("Content-Type", contentType);
      }
      return new Response(assetResponse.body, {
        status: assetResponse.status,
        statusText: assetResponse.statusText,
        headers,
      });
    }

    return assetResponse;
  },
};

/**
 * Devuelve el Content-Type con charset=utf-8 según la extensión del archivo.
 * Retorna null si la extensión no necesita charset explícito (imágenes, fuentes, etc.).
 */
function getContentType(pathname: string): string | null {
  const ext = pathname.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "html":
    case "htm":
      return "text/html; charset=utf-8";
    case "css":
      return "text/css; charset=utf-8";
    case "js":
    case "mjs":
      return "application/javascript; charset=utf-8";
    case "json":
      return "application/json; charset=utf-8";
    case "xml":
      return "application/xml; charset=utf-8";
    case "svg":
      return "image/svg+xml; charset=utf-8";
    case "txt":
      return "text/plain; charset=utf-8";
    default:
      return null;
  }
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
