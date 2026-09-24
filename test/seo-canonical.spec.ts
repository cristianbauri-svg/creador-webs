// Regresión de la Fase D (canonical único, 2026-09-24): canonical, og:url,
// JSON-LD, window.__SITE_URL__ y sitemap usan siempre
// https://stratonaudio.com.co, sin importar el host por el que llegue la
// petición. Se usa el index.html real como shell y una D1 simulada.

import { env } from "cloudflare:workers";
import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker, { type Env } from "../src";
import indexHtml from "../public/index.html?raw";
import appJs from "../public/js/app.js?raw";
import wranglerJsonc from "../wrangler.jsonc?raw";

const APEX = "https://stratonaudio.com.co";

// Hosts posibles: el canónico, http y www (hoy los redirige la zona, pero el
// Worker no debe depender de eso), workers.dev (cerrado) y desarrollo local.
const HOSTS = [
  "https://stratonaudio.com.co",
  "http://stratonaudio.com.co",
  "https://www.stratonaudio.com.co",
  "https://straton-audio.figueroagabrieloficial.workers.dev",
  "http://127.0.0.1:8787",
];

const PAGES: Record<string, Record<string, unknown>> = {
  sonido: {
    id: 3,
    slug: "sonido",
    title: "Alquiler de sonido profesional",
    meta_title: "Sonido para eventos | Straton Audio",
    meta_description: "Sonido profesional para eventos en Bogotá.",
    status: "published",
    bg_color: null,
    content_json: JSON.stringify([{ type: "hero", props: { title: "Sonido profesional para tu evento" } }]),
  },
  "pantallas-led": {
    id: 1,
    slug: "pantallas-led",
    title: "Pantallas LED",
    meta_title: "Pantallas LED | Straton Audio",
    meta_description: "Alquiler y venta de pantallas LED.",
    status: "published",
    bg_color: null,
    content_json: JSON.stringify([{ type: "hero", props: { title: "Pantallas LED" } }]),
  },
};

/** D1 simulada: la página por slug y la lista publicada para el sitemap. */
function mockDb(): D1Database {
  return {
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => (/FROM pages WHERE slug = \?/.test(sql) ? PAGES[String(args[0])] ?? null : null),
        all: async () => ({ results: [] }),
      }),
      first: async () => null,
      all: async () => ({
        results: /FROM pages WHERE status = 'published'/.test(sql)
          ? Object.values(PAGES).map((p) => ({ slug: p.slug, updated_at: "2026-09-10 22:12:33" }))
          : [],
      }),
    }),
  } as unknown as D1Database;
}

function testEnv(): Env {
  return {
    ...(env as unknown as Env),
    STRATON_DB: mockDb(),
    ASSETS: {
      fetch: async () => new Response(indexHtml, { headers: { "Content-Type": "text/html" } }),
    },
  };
}

async function get(url: string): Promise<string> {
  const ctx = createExecutionContext();
  const response = await worker.fetch(new Request(url, { headers: { Accept: "text/html" } }), testEnv(), ctx);
  await waitOnExecutionContext(ctx);
  expect(response.status, url).toBe(200);
  return response.text();
}

const canonicals = (html: string) => [...html.matchAll(/<link rel="canonical" href="([^"]*)"/g)].map((m) => m[1]);
const ogUrl = (html: string) => html.match(/<meta property="og:url" content="([^"]*)"/)?.[1];
const siteUrl = (html: string) => html.match(/window\.__SITE_URL__ = "([^"]*)"/)?.[1];

/** Bloques JSON-LD del documento, ya parseados. */
function jsonLdBlocks(html: string): unknown[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
}

/** Valores de @id, url, item e image: las URLs del grafo que apuntan al sitio. */
function jsonLdSiteUrls(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((n) => jsonLdSiteUrls(n, out));
  else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      if (["@id", "url", "item", "image"].includes(key) && typeof value === "string") out.push(value);
      else jsonLdSiteUrls(value, out);
    }
  }
  return out;
}

const OTHER_HOSTS = /http:\/\/stratonaudio|www\.stratonaudio|workers\.dev|127\.0\.0\.1|localhost/;

describe("canonical único: home", () => {
  for (const host of HOSTS) {
    it(`${host}/ → un solo canonical, https://stratonaudio.com.co/`, async () => {
      const html = await get(`${host}/`);
      expect(canonicals(html)).toEqual([`${APEX}/`]);
      // og:url idéntico al canonical, con la barra final.
      expect(ogUrl(html)).toBe(`${APEX}/`);
      expect(siteUrl(html)).toBe(APEX);
    });

    it(`${host}/ → JSON-LD solo con el apex HTTPS`, async () => {
      const html = await get(`${host}/`);
      const blocks = jsonLdBlocks(html);
      expect(blocks.length).toBeGreaterThan(0);
      const urls = jsonLdSiteUrls(blocks);
      expect(urls.length).toBeGreaterThan(0);
      for (const url of urls) expect(url.startsWith(APEX), url).toBe(true);
      expect(JSON.stringify(blocks)).not.toMatch(OTHER_HOSTS);
    });
  }

  it("la query de la home no genera otro canonical", async () => {
    expect(canonicals(await get(`${APEX}/?utm_source=x&gclid=y`))).toEqual([`${APEX}/`]);
  });
});

describe("canonical único: páginas dinámicas", () => {
  for (const slug of ["sonido", "pantallas-led"]) {
    for (const host of HOSTS) {
      it(`${host}/${slug} → canonical y og:url exactos, un solo canonical`, async () => {
        const html = await get(`${host}/${slug}`);
        expect(canonicals(html)).toEqual([`${APEX}/${slug}`]);
        expect(ogUrl(html)).toBe(`${APEX}/${slug}`);
        expect(siteUrl(html)).toBe(APEX);
      });

      it(`${host}/${slug} → WebSite, WebPage y Breadcrumb con el apex HTTPS`, async () => {
        const html = await get(`${host}/${slug}`);
        const blocks = jsonLdBlocks(html);
        const graph = blocks.flatMap((b) => ((b as { "@graph"?: unknown[] })["@graph"] ?? []) as Array<Record<string, unknown>>);
        const byType = (t: string) => graph.find((n) => n["@type"] === t) as Record<string, unknown>;

        expect(byType("WebSite")).toMatchObject({ "@id": `${APEX}/#website`, url: APEX });
        expect(byType("WebPage")).toMatchObject({ "@id": `${APEX}/${slug}#webpage`, url: `${APEX}/${slug}`, isPartOf: { "@id": `${APEX}/#website` } });
        expect(byType("BreadcrumbList")).toMatchObject({
          itemListElement: [{ item: APEX }, { item: `${APEX}/${slug}` }],
        });
        for (const url of jsonLdSiteUrls(blocks)) expect(url.startsWith(APEX), url).toBe(true);
        expect(JSON.stringify(blocks)).not.toMatch(OTHER_HOSTS);
      });
    }

    it(`/${slug} con query → canonical sin query`, async () => {
      const html = await get(`${APEX}/${slug}?utm_source=x&gclid=y`);
      expect(canonicals(html)).toEqual([`${APEX}/${slug}`]);
      expect(ogUrl(html)).toBe(`${APEX}/${slug}`);
    });
  }
});

describe("sitemap.xml", () => {
  for (const host of HOSTS) {
    it(`${host}/sitemap.xml → solo https://stratonaudio.com.co/...`, async () => {
      const xml = await get(`${host}/sitemap.xml`);
      const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
      expect(locs).toEqual([`${APEX}/`, `${APEX}/sonido`, `${APEX}/pantallas-led`]);
      expect(xml).not.toMatch(OTHER_HOSTS);
    });
  }
});

describe("enlaces internos y configuración", () => {
  it("app.js ya no reescribe enlaces según el origen", () => {
    expect(appJs).not.toMatch(/fixInternalLinks/);
    expect(appJs).not.toMatch(/location\.origin/);
    expect(appJs).not.toMatch(/__SITE_URL__/);
  });

  it("los enlaces absolutos de index.html usan solo el apex HTTPS", () => {
    const absolutos = [...indexHtml.matchAll(/href="(https?:\/\/[^"]*stratonaudio[^"]*)"/g)].map((m) => m[1]);
    expect(absolutos.length).toBeGreaterThan(0);
    for (const href of absolutos) expect(href.startsWith(APEX), href).toBe(true);
  });

  it("wrangler.jsonc mantiene workers_dev y preview_urls en false", () => {
    const config = JSON.parse(wranglerJsonc.split(/\r?\n/).filter((l) => !/^\s*\/\//.test(l)).join("\n"));
    expect(config.workers_dev).toBe(false);
    expect(config.preview_urls).toBe(false);
  });
});
