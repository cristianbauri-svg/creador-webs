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

function mockEnv() {
  const mockDb = {
    prepare: () => ({
      bind: () => ({ first: async () => PAGE }),
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

    // La regla que oculta las secciones de la home está presente.
    expect(html).toContain("#statsBanner,#servicios");

    // El JSON-LD y el script de página se inyectan.
    expect(html).toContain("window.__PAGE__");
    expect(html).toContain('rel="canonical"');

    // El title server-side usa el meta_title.
    expect(html).toContain("Alquiler de Sonido Profesional | Straton Audio");
  });
});
