# CLAUDE.md — straton-audio-web

Sitio de **Straton Audio**, servido en https://stratonaudio.com.co por un Cloudflare Worker.
Este archivo reúne la arquitectura y las reglas estables del proyecto. El estado de
producción, los rollbacks y el historial viven en `audit/`, sobre todo en
`audit/experimento-gtm/rollback.md`.

## Arquitectura

- **Worker `straton-audio`** (`wrangler.jsonc`), en TypeScript: `src/index.ts` (entrada),
  `src/routes/` (API), `src/middleware/` (acceso), `src/seo/` (canonical, JSON-LD, sitemap).
- **Frontend vanilla** (HTML/CSS/JS) en `public/`, servido como **Workers Static Assets**
  (binding `ASSETS`, `run_worker_first: ["/*"]`). No es Cloudflare Pages. El panel de
  administración está en `public/admin/`.
- El Worker sirve los assets con `env.ASSETS.fetch()` y ajusta el HTML con `HTMLRewriter`.
- Bindings (`wrangler.jsonc`):
  - `STRATON_DB` → D1 `straton-db`
  - `STRATON_KV` → KV
  - `STRATON_BUCKET` → R2 `straton-bucket` (imágenes del sitio)
  - `ASSETS` → `public/`
- `straton-backups` es un bucket R2 **privado** para backups de D1. No es binding del Worker,
  no debe agregarse como binding sin una decisión de arquitectura explícita y no se usa
  para assets.
- El dominio es un Workers Custom Domain configurado en el dashboard, no en
  `wrangler.jsonc`. El resto del estado externo (HTTPS, www, Access) está en
  `audit/experimento-gtm/rollback.md`.
- Esquema de D1 en `migrations/`. Las migraciones 010–013 se aplicaron con
  `wrangler d1 execute --file` y no figuran en `d1_migrations`: **no ejecutar
  `wrangler d1 migrations apply --remote`**.
- Sin dependencias de runtime: `package.json` solo tiene herramientas de desarrollo.

## Invariantes de seguridad

- `"workers_dev": false` y `"preview_urls": false` en `wrangler.jsonc`. No volver a habilitar
  workers.dev ni las URLs de versión: sirven versiones antiguas con los bindings de producción.
- Producción se sirve solo por `https://stratonaudio.com.co`. Canonical, `og:url`, JSON-LD y
  sitemap salen de `SITE_URL` (`src/seo/jsonld.ts`), nunca del host de la petición.
- Cloudflare Access protege `/admin` a nivel de ruta. En la API, `src/middleware/access.ts`
  exige sesión para toda escritura, para toda lectura de `/api/quotations*` y para cualquier
  `?status` distinto de `published`. La única excepción deliberada es `POST /api/quotations`,
  el formulario público. `test/api-seguridad.spec.ts` cubre estas reglas. No relajar la
  autenticación sin autorización explícita.
- `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` son secrets del Worker (`wrangler secret put`).
  Ningún secreto va en git: `.dev.vars` es local y no se versiona; `.dev.vars.example` solo
  tiene placeholders. El token de Telegram anterior está revocado.
- Rocket Loader debe seguir desactivado en la zona: el HTML servido no debe contener
  `rocket-loader`.

## Deploy y rollback

- **No desplegar sin autorización explícita del usuario.**
- Antes: revisar `wrangler.jsonc` (nombre `straton-audio`, `workers_dev` y `preview_urls`
  en `false`), `git status` limpio y pruebas locales.
- Después de cualquier deploy o rollback: confirmar que workers.dev y las previews siguen
  desactivados, que los endpoints protegidos responden 401 sin sesión y que el sitio, el
  formulario y Telegram funcionan. Los comandos están en `audit/experimento-gtm/rollback.md`.
- `audit/experimento-gtm/rollback.md` es la fuente operativa del estado de producción y de
  los rollbacks. Consultarlo antes de cualquier rollback.
- Una versión del Worker incluye sus secretos y su configuración, no solo el código.
  **No volver a una versión antigua basándose solo en su código.** El punto de rollback
  operativo actual es `65c3ee36`, mientras sea compatible con lo que se quiera revertir.
- **Prohibido volver a versiones anteriores al hotfix de seguridad `703e2c0`.** Para deshacer
  algo más antiguo, hacer un commit nuevo sobre el código actual.

## Local y producción

- `wrangler dev` usa estado local (`.wrangler/state`, con D1, KV y R2 emulados) salvo que se
  pida acceso remoto de forma explícita.
- Distinguir siempre D1 local de D1 remoto (`--remote`).
- En Wrangler 4, `wrangler r2 object …` actúa en **local** por defecto. Para producción, usar
  `--remote`.
- Un mensaje de la CLI no prueba que una operación remota ocurrió: Wrangler 4.99 muestra
  "Delete complete." aunque la API rechace el borrado. Verificar siempre con una lectura
  posterior.
- Autenticación: sesión OAuth de Wrangler. Si el entorno define `CLOUDFLARE_API_TOKEN`, ese
  token no sirve para este proyecto: ejecutar `env -u CLOUDFLARE_API_TOKEN npx wrangler …`.
- Validación local: `npx tsc --noEmit` y
  `npx vitest run test/api-seguridad.spec.ts test/seo-canonical.spec.ts test/server-render.spec.ts`.
  `test/index.spec.ts` es la plantilla del starter y no prueba este Worker.

## Backups y datos

- Los backups operativos de D1 van al bucket privado `straton-backups`, con retención
  automática de 90 días.
- Los exports de D1 contienen PII y son sensibles. No guardar volcados de D1 en el repo ni en
  `.wrangler/state`.
- Antes de borrar datos o backups, confirmar que existe una copia restaurable válida.

## Analítica

- GTM está integrado en `public/index.html` y `public/404.html`. No alterar el tracking
  existente (GTM, la CSP de `public/_headers`, los CTA de WhatsApp en pestaña nueva) como
  efecto lateral de cambios no relacionados.
- El tracking avanzado (GCLID, lead cualificado) es trabajo futuro: no implementarlo durante
  el mantenimiento general.

## Forma de trabajo

- Rama de trabajo: `straton-audio-web`. Cambios delicados en ramas separadas y commits
  atómicos. Revisar `git status` antes y después de cada cambio.
- No hacer merge, deploy ni cambios irreversibles sin autorización cuando la fase lo requiera.
- No saltarse reglas `deny` ni hooks del entorno. Si una protección local bloquea una
  operación destructiva, detenerse y pedir al usuario que la ejecute o la autorice; no
  buscar un bypass.
- Antes de depender de una herramienta, MCP, skill o modelo concreto, verificar que esté
  disponible en la sesión actual.
- Comunicación en español neutro, sin jerga regional. Términos técnicos en inglés.
