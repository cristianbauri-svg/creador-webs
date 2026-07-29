// Sitemap XML dinámico — se genera en cada request consultando D1, para que
// quede siempre sincronizado con lo que el panel admin publique o borre
// (el sitio no tiene una lista fija de páginas: se crean/eliminan desde /admin).
import { queryAll } from "../utils/d1";
import type { Env } from "../index";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function urlEntry(loc: string, lastmod?: unknown): string {
  const lastmodValue = typeof lastmod === "string" ? lastmod.slice(0, 10) : "";
  const lastmodTag = lastmodValue ? `<lastmod>${lastmodValue}</lastmod>` : "";
  return `<url><loc>${escapeXml(loc)}</loc>${lastmodTag}</url>`;
}

export async function handleSitemap(env: Env, origin: string): Promise<Response> {
  const entries = [urlEntry(`${origin}/`)];

  try {
    const pages = await queryAll(
      env.STRATON_DB,
      "SELECT slug, updated_at FROM pages WHERE status = 'published'"
    );
    for (const page of pages) {
      const slug = String(page.slug || "").trim();
      if (!slug) continue;
      entries.push(urlEntry(`${origin}/${slug}`, page.updated_at));
    }
  } catch (e) {
    console.error("Error generando sitemap:", e);
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${entries.join("\n")}\n` +
    `</urlset>`;

  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
