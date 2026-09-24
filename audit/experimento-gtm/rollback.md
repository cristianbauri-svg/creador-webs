# Rollback y estado de producción — Straton Audio

## Producción actual (registrada el 2026-09-24)

| Dato | Valor |
|---|---|
| Commit | `c449d9b635531f199928aa111565b5719e1cce0e` (rama `straton-audio-web`) |
| Versión del Worker | `cb79a035-f471-49cd-a8e8-8bff7a0ed45f` (tag `c449d9b`) |
| Deployment | `54a822d4-111c-47d3-b215-7f9579f4008d` (2026-09-24T17:26:43Z, 100 % del tráfico) |
| Contenido | GTM diferido a 3 s y CTA de WhatsApp en pestaña nueva (`93a4d5a`), hotfix de seguridad (`703e2c0`), workers.dev y URLs de versión cerrados en la config (`398dfe3`) y canonical único (`948f868`, `c449d9b`). |

Verificado ese día: el `index.js` desplegado es byte a byte el build de `c449d9b`.

## Rollback seguro

La única versión anterior a la que se puede volver es:

| Versión | Commit | Qué se pierde |
|---|---|---|
| `d6b9b626-27fd-431c-96ce-956fcb8fbd96` (deployment `4c45a512-f7db-4ffc-856b-68b7d3cce046`, 2026-09-24T15:46:14Z) | `703e2c0` | Solo el canonical único: canonical, `og:url`, JSON-LD de página y sitemap vuelven a armarse con el host de la petición, y la home queda sin canonical. Conserva el hotfix de seguridad. Con el estado externo actual (solo se sirve `https://stratonaudio.com.co`) el efecto práctico es pequeño. |

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

### Nivel 1: volver a la versión segura (segundos)

Cada versión lleva su propio manifiesto de assets, así que el rollback restaura
también `app.js` y el HTML, no solo el código del Worker.

```bash
env -u CLOUDFLARE_API_TOKEN npx wrangler rollback d6b9b626-27fd-431c-96ce-956fcb8fbd96 --message "rollback a d6b9b626" -y
```

### Nivel 2: revertir en git (minutos)

Deja el repositorio y producción alineados. Conserva el hotfix y la config que
cierra workers.dev.

```bash
git revert c449d9b635531f199928aa111565b5719e1cce0e 948f868a6a92f7acbe25074e029d563a45f18e9c
env -u CLOUDFLARE_API_TOKEN npx wrangler deploy --tag <sha> --message "revert: canonical único"
```

## Después de CUALQUIER rollback o deploy

1. **workers.dev y las URLs de versión siguen cerradas.** Las URLs de versión
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
2. **Seguridad**, sin sesión y sin escribir nada:
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X PUT https://stratonaudio.com.co/api/events/999999999   # 401
   curl -s -o /dev/null -w "%{http_code}\n" "https://stratonaudio.com.co/api/events?status=all"        # 401
   curl -s -o /dev/null -w "%{http_code}\n" https://stratonaudio.com.co/api/quotations/999999999 -X PUT # 401
   ```
3. `/`, `/sonido` y `/pantallas-led` responden 200.

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
| Secretos de producción | `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` como secrets del Worker | `wrangler secret put` (no están en git ni en `.dev.vars`; ver `.dev.vars.example`) |
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
