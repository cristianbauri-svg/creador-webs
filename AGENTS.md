# AGENTS.md — straton-audio-web

Guía corta de ejecución para cualquier agente que trabaje en este repositorio.

| Documento | Contenido |
|---|---|
| `AGENTS.md` | Esta guía: qué hacer y qué no, en corto. |
| `CLAUDE.md` | Arquitectura e invariantes durables, con detalle. |
| `audit/experimento-gtm/rollback.md` | Estado operativo de producción y procedimientos de rollback. |

Si algo de esta guía parece contradecir `CLAUDE.md` o `audit/experimento-gtm/rollback.md`,
mandan esos dos: avisar al usuario antes de seguir.

## Antes de empezar

- Leer `CLAUDE.md` antes de modificar el proyecto.
- Para deploy o rollback, consultar `audit/experimento-gtm/rollback.md`.
- Revisar `git status`.
- Antes de depender de una herramienta, MCP o skill, comprobar que está disponible en la sesión.

## Arquitectura rápida

- Cloudflare Worker `straton-audio` (`wrangler.jsonc`), en TypeScript dentro de `src/`.
- Frontend vanilla en `public/`, servido como Workers Static Assets. No es Cloudflare Pages.
- Panel de administración en `public/admin/`.
- Bindings: `STRATON_DB` → D1 `straton-db`, `STRATON_KV` → KV, `STRATON_BUCKET` → R2
  `straton-bucket` y `ASSETS` → `public/`.
- `straton-backups` es un bucket R2 privado de backups y **no** es binding del Worker.

## Reglas no negociables

- No desplegar sin autorización explícita del usuario.
- `workers_dev` y `preview_urls` quedan en `false` en `wrangler.jsonc`. No habilitar
  workers.dev ni las URLs de versión.
- No relajar Cloudflare Access. `POST /api/quotations` es la única escritura pública deliberada.
- Nada de secretos ni PII en git. `.dev.vars` no se versiona; la plantilla es
  `.dev.vars.example`.
- No guardar volcados de D1 con PII dentro del repo.
- No saltarse reglas `deny`, hooks ni otras protecciones del entorno. Si una operación
  destructiva queda bloqueada, detenerse y pedir al usuario que la ejecute o la autorice;
  no buscar un bypass.

## Local vs producción

- `wrangler dev` usa estado local (`.wrangler/state`) salvo que se pida acceso remoto de
  forma explícita.
- Distinguir siempre D1 y R2 locales de los remotos.
- Para R2 de producción, usar `--remote` cuando el comando lo admita.
- Después de una operación destructiva remota, verificar el estado con una lectura: el
  mensaje de la CLI no basta.

## Cambios y git

- Partir de `straton-audio-web`; los cambios delicados van en una rama separada.
- Commits atómicos, sin mezclar cambios no relacionados.
- `git status` antes y después de cada cambio.
- No hacer merge irreversible sin autorización cuando la fase lo requiera.

## Pruebas mínimas

```bash
npx tsc --noEmit
npx vitest run \
  test/api-seguridad.spec.ts \
  test/seo-canonical.spec.ts \
  test/server-render.spec.ts
```

`test/index.spec.ts` viene de la plantilla del starter y no representa la cobertura
principal del Worker.

## Deploy y rollback

- Procedimientos y estado vigente: `audit/experimento-gtm/rollback.md`.
- Antes de desplegar, revisar `wrangler.jsonc`.
- Después de un deploy o rollback, comprobar que workers.dev y las previews siguen
  desactivados, que los endpoints protegidos responden 401 sin sesión y que funcionan las
  páginas principales, el formulario y Telegram.
- Una versión del Worker incluye configuración y secrets, no solo código: no volver a una
  versión antigua basándose solo en su código.
- No volver directamente a versiones anteriores al hotfix de seguridad `703e2c0`.

## Migraciones

- `migrations/` contiene de la 001 a la 013.
- Las 010–013 ya se aplicaron fuera de `d1_migrations` y no figuran como registradas.
- No ejecutar `wrangler d1 migrations apply --remote` hasta reconciliar ese estado.

## Backups

- Los backups operativos de D1 van al bucket privado `straton-backups`, sin binding y con
  lifecycle de 90 días.
- Los exports de D1 contienen PII: tratarlos como sensibles.
- Antes de borrar datos, confirmar que existe un backup restaurable.

## Analítica

- No romper GTM, la CSP de `public/_headers` ni los CTA de WhatsApp como efecto lateral.
- El tracking de GCLID y lead cualificado es trabajo futuro: no implementarlo por accidente.
