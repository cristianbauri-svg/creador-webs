import {
  env,
  createExecutionContext,
  waitOnExecutionContext,
} from "cloudflare:test";
import { describe, it, expect } from "vitest";
import worker from "../src";

// Shell mínimo que simula el index.html servido como asset estático.
const SHELL_HTML = `<!doctype html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Straton Audio — Home</title>
  <meta name="description" content="Home description" />
  <meta property="og:title" content="Straton Audio" />
  <meta property="og:description" content="Home og" />
  <meta property="og:url" content="https://stratonaudio.com.co" />
</head>
<body>
  <div id="dynamic-page" class="dynamic-page" style="display:none;"></div>
  <section class="hero" id="hero">
    <div class="hero-bg">
      <video autoplay muted loop playsinline>
        <source src="/videos/video_hero.webm" type="video/webm" />
      </video>
    </div>
    <h1 class="hero-title" id="heroTitle">Soluciones profesionales en audio e iluminación</h1>
  </section>
  <section id="statsBanner">stats</section>
  <section id="servicios">servicios</section>
</body>
</html>`;

const PAGE = {
  id: 3,
  slug: "sonido",
  title: "Alquiler de Sonido Profesional",
  meta_title: "Alquiler de Sonido Profesional | Straton Audio",
  meta_description: "Diseñamos sistemas de sonido a la medida de tu evento. Cobertura en Bogotá.",
  content_json: JSON.stringify([
    {
      type: "hero",
      props: {
        bg_url: "/api/media/products/9d40c561-e02f-4881-a621-644863b6d044-1600.webp",
        title: "Alquiler de Sonido Profesional para Eventos en Bogotá",
        subtitle: "Diseñamos sistemas de sonido a la medida de tu evento.",
        button_text: "Cotizar mi evento",
        button_link: "https://api.whatsapp.com/send/?phone=573102646751&text=Hola",
        button_style: "2",
      },
    },
    { type: "text", props: { title: "Intro", content: "✓ Cobertura en Bogotá" } },
  ]),
};

function mockEnv(page: Record<string, unknown> = PAGE) {
  const mockDb = {
    prepare: () => ({
      bind: () => ({ first: async () => page }),
    }),
  };
  const mockAssets = {
    fetch: async () =>
      new Response(SHELL_HTML, { headers: { "Content-Type": "text/html" } }),
  };
  return {
    ...env,
    ASSETS: mockAssets,
    STRATON_DB: mockDb,
  } as unknown as typeof env;
}

/** Pide /sonido al Worker con la página indicada en D1. */
async function render(page: Record<string, unknown> = PAGE): Promise<Response> {
  const request = new Request("https://stratonaudio.com.co/sonido", {
    headers: { Accept: "text/html" },
  });
  const ctx = createExecutionContext();
  const response = await worker.fetch(request, mockEnv(page), ctx);
  await waitOnExecutionContext(ctx);
  return response;
}

describe("server-render del hero dinámico (punto 1)", () => {
  it("renderiza el hero en el HTML inicial y oculta la home", async () => {
    const e = mockEnv();
    const request = new Request("https://stratonaudio.com.co/sonido", {
      headers: { Accept: "text/html" },
    });
    const ctx = createExecutionContext();
    const response = await worker.fetch(request, e, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(200);
    const html = await response.text();

    // El H1 de la landing está presente (server-render).
    expect(html).toContain(
      "Alquiler de Sonido Profesional para Eventos en Bogotá"
    );

    // El hero dinámico se inyecta dentro de #dynamic-page con display:block.
    expect(html).toContain('class="dynamic-block block-hero"');
    expect(html).toContain('id="dynamic-page"');

    // El video de la home fue eliminado.
    expect(html).not.toContain("video_hero.webm");

    // El H1 de la home fue eliminado (se elimina la sección #hero completa).
    expect(html).not.toContain('id="hero"');

    // El markup exclusivo de la landing no viaja en una página dinámica.
    expect(html).not.toContain('id="statsBanner"');
    expect(html).not.toContain('id="servicios"');

    // El contenedor dinámico sí se muestra.
    expect(html).toContain("#dynamic-page{display:block!important}");

    // El JSON-LD y el script de página se inyectan.
    expect(html).toContain("window.__PAGE__");
    expect(html).toContain('rel="canonical"');

    // El title server-side usa el meta_title.
    expect(html).toContain("Alquiler de Sonido Profesional | Straton Audio");
  });

  it("no inventa variantes para una URL que ya es una variante", async () => {
    // El hero de PAGE apunta a "…-1600.webp": derivar "-1600-640.webp" daría
    // 404 y el navegador no vuelve al src, así que la imagen desaparecería.
    const response = await render(PAGE);
    const html = await response.text();

    expect(html).not.toContain("-1600-640.webp");
    expect(html).not.toContain("srcset=");
    // Aun sin variantes, el hero conserva la prioridad de carga.
    expect(html).toContain('fetchpriority="high"');
  });

  it("sirve el hero con variantes responsive y solo prioriza el primero", async () => {
    const base = "/api/media/products/9d40c561-e02f-4881-a621-644863b6d044.webp";
    const page = {
      ...PAGE,
      content_json: JSON.stringify([
        { type: "hero", props: { bg_url: base, title: "Primer hero" } },
        { type: "hero", props: { bg_url: base, title: "Segundo hero" } },
      ]),
    };

    const response = await render(page);
    const html = await response.text();

    // Las dos variantes pre-generadas más el original como candidata ancha.
    expect(html).toContain(
      `srcset="${base.replace(".webp", "-640.webp")} 640w, ${base.replace(".webp", "-1280.webp")} 1280w, ${base} 1920w"`
    );
    expect(html).toContain('sizes="100vw"');

    // Server-side solo se dibuja un hero —el primero— y es el que lleva
    // prioridad de carga. (El segundo llega en window.__PAGE__ y lo dibuja
    // app.js, ya en diferido.)
    expect(html.match(/class="dynamic-block block-hero"/g)).toHaveLength(1);
    expect(html).toContain("<h1>Primer hero</h1>");
    expect(html).toContain('fetchpriority="high"');
    expect(html).not.toContain('loading="lazy"');
  });
});
