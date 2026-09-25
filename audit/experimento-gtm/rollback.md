# Rollback y estado de producción — Straton Audio

## Producción actual (registrada el 2026-09-25)

| Dato | Valor |
|---|---|
| Commit | `d9001f337f78ceaeac6faf85f48cf77a05c92e51` (rama `straton-audio-web`) |
| Versión del Worker | `04a5d4ef-36c0-4dcf-8266-08a298d85dcb` (tag `product-r2-order-20260925`) |
| Deployment | `332e5b76-8aa7-4111-aeae-fbf32133f9b8` (2026-09-25T01:47:45Z, 100 % del tráfico) |
| `script_etag` | `bb4610ef9c9bdfac4895543a33eb36f1f9a6ee04824359b974f41c813d7bbbd8` |
| Motivo de la versión | `updateProduct` ahora espera a que D1 complete correctamente el UPDATE antes de pedir el borrado de la imagen anterior en R2. |
| Contenido | GTM diferido a 3 s y CTA de WhatsApp en pestaña nueva (`93a4d5a`), hotfix de seguridad (`703e2c0`), workers.dev y URLs de versión cerrados en la config (`398dfe3`), canonical único (`948f868`, `c449d9b`), media nueva de eventos en `events/` (`46aed52`) y hardening de productos (`d9001f3`). |

Qué conserva `04a5d4ef`:

- El hotfix de seguridad, el canonical único y workers.dev y las previews
  cerrados.
- El token de Telegram vigente: hereda los secretos `TELEGRAM_BOT_TOKEN` y
  `TELEGRAM_CHAT_ID` de la versión anterior.
- El panel de Eventos sigue subiendo las imágenes nuevas a `events/`.
- La arquitectura R2 actual: `STRATON_BUCKET` → `straton-bucket` es el único
  bucket enlazado; `straton-backups` y `straton-archive` no son bindings (ver
  `audit/r2-storage-state-20260925.md`).
- Compatibilidad: `2026-06-16` con `nodejs_compat`.
- Bindings sin cambios respecto de `93bbfce5`: `ASSETS`, `STRATON_DB`,
  `STRATON_KV`, `STRATON_BUCKET`, las variables de Access y `ENVIRONMENT`, y
  los dos secretos de Telegram.

Historial del script: el `index.js` de `cb79a035` (deployment `54a822d4`) es byte
a byte el build de `c449d9b`, y tanto `65c3ee36` como `93bbfce5` tienen ese mismo
script (`script_etag` `fde2021d089d202713d9ac835ebb8b206a9afdadcef9f0537041d7dcefb9b5d3`).
`93bbfce5` solo cambió un Static Asset: `public/admin/modules/events.html` pasó a
enviar `folder = events` a `/api/upload`. `04a5d4ef` es la primera versión con un
script distinto desde entonces, por el cambio en `src/routes/products.ts`.

## Rollback

| Versión | Commit | Uso | Qué reintroduce |
|---|---|---|---|
| `04a5d4ef-36c0-4dcf-8266-08a298d85dcb` (deployment `332e5b76-8aa7-4111-aeae-fbf32133f9b8`) | `d9001f3` | **Baseline estable actual.** Si un deploy posterior falla, se vuelve aquí. | Nada: es la producción actual. |
| `93bbfce5-4610-4882-affa-b5ecf33716b2` (deployment `ef80096a-ac93-490e-92c1-acbfd0bd792d`) | `46aed52` | Producción inmediatamente anterior. Sirve para revertir específicamente el hardening `d9001f3` si ese cambio causara una incidencia. | El bug de productos: un UPDATE puede pedir borrar la imagen antigua de R2 antes de saber si D1 aceptó el cambio. |
| `65c3ee36-a675-43c1-b317-703c912c1d7f` (deployment histórico `c37d2837-4563-427e-aabb-3d1e18d0c5e2`) | `f2dea14` (runtime de `c449d9b`) | Fallback histórico más antiguo. | El bug de productos y, además, el panel de Eventos antiguo: las imágenes nuevas de eventos vuelven a caer en `products/`. |

Las tres conservan el hotfix de seguridad, el canonical único y el token de
Telegram vigente. Ninguna reabre workers.dev ni las previews: son ajustes del
script, no de la versión.

### Estado de D1 y compatibilidad

- La D1 se reconcilió el 2026-09-25 (D1-M2): las migraciones 001–013 están
  registradas, 010 está aplicada (`products.category` ya no tiene CHECK) y no
  quedan migraciones pendientes conocidas. Detalle, backup y bookmarks:
  `audit/d1-migrations-reconciliation-20260925.md`.
- **Un rollback del Worker no revierte D1.** 010 solo eliminó el CHECK
  restrictivo de `category` y no quitó columnas, así que las tres versiones de
  la tabla siguen siendo compatibles con el esquema actual.
- Esa compatibilidad no es automática hacia adelante. Si una migración 014+
  cambia el esquema, o un deploy agrega bindings o vuelve a rotar un secreto,
  hay que revisar la compatibilidad antes de volver a cualquiera de estas
  versiones.

### `cb79a035` y `d6b9b626` no sirven como rollback completo

`cb79a035-f471-49cd-a8e8-8bff7a0ed45f` y `d6b9b626-27fd-431c-96ce-956fcb8fbd96`
contienen el `TELEGRAM_BOT_TOKEN` anterior, y ese token se revocó en BotFather.
Volver directamente a ellas **no** vuelve válido el token viejo: provocaría
fallos en las notificaciones de Telegram. El fallo no se ve en el sitio, porque
el formulario sigue respondiendo 201 y el error solo queda en los logs del
Worker (`Telegram notification failed`). **No deben usarse como rollback
completo de producción.**

Wrangler advierte que los secretos cambiaron desde esa versión, pero sin
terminal interactiva (un agente, un script o CI) la confirmación se acepta
automáticamente.
Si hace falta el código de una de esas versiones (por ejemplo, quitar el
canonical único, que es lo único que separa `d6b9b626` de `cb79a035`), se usa
el Nivel 2.

> **NO usar como rollback `5809d51e`, `65b825a5`, `9bcc9b75` ni ninguna versión
> anterior al hotfix `703e2c0`.** Tienen vulnerabilidades ya cerradas: escritura
> anónima en `/api/events`, `PUT /api/quotations/:id` sin sesión, XSS guardado
> en el portafolio, borrado arbitrario en R2 y borradores públicos. Si hace falta
> deshacer algo más antiguo (por ejemplo el diferimiento de GTM), se hace con un
> commit nuevo sobre el código actual, nunca volviendo a esas versiones.

### Antes de cualquier comando de wrangler

Si el entorno tiene `CLOUDFLARE_API_TOKEN` cargado, ese token **no es válido**
(`Invalid access token [code: 9109]`) y wrangler lo prefiere sobre la sesión
OAuth. Hay que quitarlo de la invocación:

```bash
env -u CLOUDFLARE_API_TOKEN npx wrangler deployments status
```

### Nivel 1: volver a una versión anterior (segundos)

Elegir la versión de destino en la tabla anterior. Para deshacer un deploy
posterior a la baseline actual, el destino es `04a5d4ef`. Las versiones más
antiguas solo se usan conociendo lo que reintroducen. Cada versión lleva su
propio manifiesto de assets y sus propios secretos, así que el rollback
restaura también `app.js`, el HTML y los secretos de esa versión, no solo el
código del Worker.

```bash
env -u CLOUDFLARE_API_TOKEN npx wrangler rollback <version_id> --message "rollback a <version_id>" -y
```

Por ejemplo, para volver a la baseline actual después de un deploy fallido:
`env -u CLOUDFLARE_API_TOKEN npx wrangler rollback 04a5d4ef-36c0-4dcf-8266-08a298d85dcb --message "rollback a 04a5d4ef" -y`.

### Nivel 2: revertir en git (minutos)

Deja el repositorio y producción alineados. Conserva el hotfix, la config que
cierra workers.dev y los secretos vigentes: `wrangler deploy` no toca los
secretos (los deploys de `d6b9b626` y `cb79a035` los conservaron).

```bash
git revert <sha del cambio a deshacer>
env -u CLOUDFLARE_API_TOKEN npx wrangler deploy --tag <sha> --message "revert: <qué se deshace>"
```

Por ejemplo, para quitar el canonical único:
`git revert c449d9b635531f199928aa111565b5719e1cce0e 948f868a6a92f7acbe25074e029d563a45f18e9c`.

## Después de CUALQUIER rollback o deploy

1. **workers.dev = false y previews_enabled = false.** Las URLs de versión
   sirven versiones viejas con los bindings de producción (D1, KV y R2), así que
   esto se comprueba siempre:
   - Dashboard: Workers → `straton-audio` → Settings → Domains & Routes:
     workers.dev y Preview URLs desactivados.
   - O por API: `GET /accounts/c2ced5333d7e4758d6fe9580def1bf41/workers/scripts/straton-audio/subdomain`
     debe devolver `{"enabled": false, "previews_enabled": false}`.
   - `curl -s -o /dev/null -w "%{http_code}\n" https://straton-audio.figueroagabrieloficial.workers.dev/`
     debe dar `404` (error 1042).

   Si alguno volvió a `true`, apagarlo de inmediato: dashboard, o `POST` a la
   misma ruta con `{"enabled": false, "previews_enabled": false}`.
2. **Los endpoints protegidos siguen protegidos**, sin sesión y sin escribir nada:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X PUT https://stratonaudio.com.co/api/events/999999999   # 401
   curl -s -o /dev/null -w "%{http_code}\n" "https://stratonaudio.com.co/api/events?status=all"        # 401
   curl -s -o /dev/null -w "%{http_code}\n" https://stratonaudio.com.co/api/quotations/999999999 -X PUT # 401
   ```
3. **Página web funcional:** `/`, `/sonido` y `/pantallas-led` responden 200.
4. **Formulario y Telegram funcionales.** Se prueban juntos: el aviso de
   Telegram solo sale al crear una cotización, y el formulario responde bien
   aunque Telegram falle.
   - Enviar una cotización de prueba con un nombre inconfundible (por ejemplo
     `PRUEBA ROLLBACK AAAA-MM-DD`). El formulario debe mostrar la confirmación y
     el aviso debe llegar al bot. Si no llega, buscar
     `Telegram notification failed` en los logs del Worker.
   - Enviada desde el navegador, GTM puede contarla como conversión del
     formulario en Google Ads.
   - Después, borrarla con autorización, como la cotización #26 del 2026-09-24:
     leer la fila, borrar con
     `DELETE FROM quotations WHERE id = <id> AND customer_name = '<nombre exacto>'`
     y confirmar que el total bajó exactamente en 1.

## Deshacer el diferimiento de GTM (sin volver a versiones viejas)

- **Solo el temporizador:** cambiar `w.setTimeout(g,3000)` por `g()` en
  `public/index.html` y `public/404.html`, y desplegar. El contenedor vuelve a
  cargar de inmediato y el resto del fragmento sigue igual.
- **Todo el cambio** (GTM inmediato y CTA en la misma pestaña):
  `git revert 93a4d5a4e431864484bae82b126629ade654c1d3` sobre el código actual y
  desplegar. Ojo: con los CTA en la misma pestaña vuelven a perderse
  conversiones de Ads (ver `README.md`).

## Estado externo que no vive (o no vive entero) en git

| Qué | Estado (2026-09-24) | Dónde se configura |
|---|---|---|
| Always Use HTTPS | **ON**: `http://` → 301 a `https://`, conserva ruta y query | Zona `stratonaudio.com.co` → SSL/TLS → Edge Certificates |
| www | DNS **proxied** y 301 a `https://stratonaudio.com.co`, conserva ruta y query | Zona → DNS y Rules → Redirect Rules |
| workers.dev | `enabled: false` | Worker → Domains & Routes; además `"workers_dev": false` en `wrangler.jsonc` |
| URLs de versión (preview) | `previews_enabled: false` | Worker → Domains & Routes; además `"preview_urls": false` en `wrangler.jsonc` |
| Dominio custom | `stratonaudio.com.co` → Worker `straton-audio` | Worker → Domains & Routes (Workers Custom Domain; no está en `wrangler.jsonc`) |
| Cloudflare Access | Protege `stratonaudio.com.co/admin` (team `divine-band-3e2f`) | Zero Trust → Access → Applications |
| Secretos de producción | `TELEGRAM_BOT_TOKEN` (rotado el 2026-09-24; el anterior está revocado en BotFather) y `TELEGRAM_CHAT_ID` como secrets del Worker. Cada versión guarda sus propios valores. | `wrangler secret put` (no están en git ni en `.dev.vars`; ver `.dev.vars.example`) |
| Dominio canónico | `https://stratonaudio.com.co` (apex, HTTPS) | `SITE_URL` en `src/seo/jsonld.ts` |

## Señales que justifican revertir

| Señal | Dónde se ve |
|---|---|
| Caída de conversiones de WhatsApp frente a la semana anterior | Google Ads, conversión `g2ljCOHE7eMcEPzh5qNE` |
| Caída de conversiones del formulario | Google Ads, conversión `2TWlCJ795OMcEPzh5qNE` |
| El contenedor deja de cargar en alguna página | Vista previa de GTM, o `gtm.js` en la pestaña de red |
| Listas de remarketing que dejan de crecer | Google Ads, audiencias |
| El panel no puede guardar eventos o cambiar el estado de una cotización | `/admin`, respuesta 401 en la pestaña de red |
| Search Console marca canónicas inesperadas | Search Console → Inspección de URL |

Las conversiones tardan en consolidarse, así que conviene mirar la ventana
completa de atribución antes de concluir que hay una caída real.
