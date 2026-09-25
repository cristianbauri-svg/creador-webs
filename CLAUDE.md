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
- Buckets R2. Solo el primero está enlazado al Worker; los otros dos no deben agregarse
  como binding ni a `wrangler.jsonc` sin una decisión de arquitectura explícita:
  - `straton-bucket`: bucket **activo** de media del sitio. Es el único bucket R2 enlazado
    al Worker, mediante `STRATON_BUCKET`.
  - `straton-backups`: **privado**, no es binding del Worker y no se usa para assets
    activos. Sirve para **recuperación temporal**: guarda exports de D1 y backups
    temporales de R2, con un lifecycle global de 90 días.
  - `straton-archive`: **privado**, no es binding del Worker y no se usa para assets
    activos. Es el **archivo histórico durable**, sin regla de expiración de objetos. Hoy
    conserva media histórica de `/sonido`.
- El dominio es un Workers Custom Domain configurado en el dashboard, no en
  `wrangler.jsonc`. El resto del estado externo (HTTPS, www, Access) está en
  `audit/experimento-gtm/rollback.md`.
- Esquema de D1 en `migrations/`. Las migraciones 010–013 ya se aplicaron fuera del
  mecanismo de `d1_migrations` y no figuran como registradas. **No ejecutar
  `wrangler d1 migrations apply --remote` hasta reconciliar primero ese estado**, porque
  Wrangler podría tratarlas como pendientes.
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
- Para cualquier operación R2 sobre producción, usar explícitamente `--remote` cuando el
  comando lo admita.
- Nunca asumir que una operación destructiva remota tuvo éxito por el mensaje de la CLI:
  verificar siempre el estado remoto con una lectura posterior.
- Autenticación: sesión OAuth de Wrangler. Si Wrangler autentica contra una cuenta o
  credencial inesperada, comprobar si `CLOUDFLARE_API_TOKEN` está sobrescribiendo la sesión
  OAuth. El procedimiento operativo vigente está en `audit/experimento-gtm/rollback.md`.
- Validación local: `npx tsc --noEmit` y
  `npx vitest run test/api-seguridad.spec.ts test/seo-canonical.spec.ts test/server-render.spec.ts`.
  `test/index.spec.ts` es la plantilla del starter y no prueba este Worker.

## Backups y datos

- Hay dos destinos, con fines distintos:
  1. `straton-backups`: **recuperación temporal**. Los exports operativos de D1 y los
     backups temporales de R2 expiran a los 90 días por lifecycle.
  2. `straton-archive`: **archivo histórico durable**, sin expiración automática. Es para
     lo que deba conservarse más allá de esos 90 días.
- Los exports de D1 contienen PII y son sensibles. No guardar volcados de D1 en el repo ni en
  `.wrangler/state`.
- Antes de borrar datos o backups, confirmar que existe una copia restaurable válida.
- Antes de restaurar un snapshot histórico de D1 que contenga URLs de media antiguas,
  verificar primero que sus keys existan en `straton-bucket` y restaurar las que falten.
  Time Travel de D1 no restaura R2.
- Estado de los buckets, resultado de la limpieza de R2 y reglas de restauración:
  `audit/r2-storage-state-20260925.md`.

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
