# CLAUDE.md — straton-audio-web

## Rol del agente

Desarrollador fullstack del sitio web **Straton Audio** (https://stratonaudio.com.co).
Stack: Cloudflare Workers + D1 + R2 + KV + Pages. HTML/CSS/JS vanilla. Sin dependencias externas.

## Infraestructura

- **Worker:** `straton-audio` (nombre en `wrangler.jsonc`).
- **`wrangler dev`:** Worker en `http://127.0.0.1:8787`. D1, KV y R2 se emulan en local (SQLite + archivos).
- **Bindings:** `STRATON_DB` (D1), `STRATON_KV` (KV), `STRATON_BUCKET` (R2).
- **Cuenta Cloudflare:** nueva cuenta independiente de `creador-webs`. Token específico para este proyecto.

## MCPs activos

- `open-design` (18 tools): plantillas y tokens de diseño
- `mcp-memory` (4 tools): memoria semántica del proyecto
- `mcp-docker`, `mcp-metrics`, `postgres`, `github`, `sequential-thinking`

## Skills

- `ui-ux-pro-max-skill`, `impeccable`, `open-design`, `frontend-design`
- Skills Cloudflare: `cloudflare`, `wrangler`, `workers-best-practices`, `web-perf`

## Separación de agentes

- **Backend (DeepSeek V4 Pro / cc-deep):** worker (`src/`), migraciones D1, API routes, R2, KV.
- **Frontend (DeepSeek V4 Flash / cc-light o Claude Sonnet 4.6):** HTML/CSS/JS en `public/` y `admin/`.

## Reglas

1. Antes de modificar infraestructura, leer `DESIGN.md`, `PRODUCT.md` y consultar `mcp-memory` en la colección `straton-audio`.
2. Usar `wrangler dev` para probar todo localmente. No desplegar sin pruebas locales.
3. Secretos en Vault (`secret/dev/`). Nunca en texto plano.
4. Commits atómicos. El hook `block-secrets.sh` bloquea credenciales.
5. Comunicación en español neutro, sin jerga regional. Términos técnicos en inglés.
6. `env.ASSETS.fetch()` NO es confiable en producción. Usar `fetch(request, { cf: { rocket_loader: false, minify: false } })` para assets.
7. Rocket Loader y Auto Minify deben estar OFF en el dashboard de Cloudflare.
8. Antes de cualquier `wrangler deploy`, verificar el nombre del worker en `wrangler.jsonc` (`"straton-audio"`).
