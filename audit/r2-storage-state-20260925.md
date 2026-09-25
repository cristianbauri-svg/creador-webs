# Estado R2 y cierre de limpieza — 2026-09-25

Estado de los tres buckets R2 de Straton Audio comprobado por lectura al cerrar la
limpieza del 2026-09-24/25 (base git `ef2eb36`, sin deploy; producción seguía en la
versión `93bbfce5`, ver `audit/experimento-gtm/rollback.md`).

Los conteos de objetos y bytes son **una foto del cierre**, no invariantes: `straton-bucket`
cambia cada vez que el panel sube o reemplaza imágenes.

## Resumen

| Bucket | Función | Binding del Worker | Acceso público | Expiración de objetos |
|---|---|---|---|---|
| `straton-bucket` | Media **activa** de producción | `STRATON_BUCKET` (el único) | Solo a través del Worker (`/api/media/…`) | No |
| `straton-backups` | Recuperación **temporal** | No | No (privado, r2.dev desactivado) | Sí, 90 días (global) |
| `straton-archive` | Archivo histórico **durable** | No | No (privado, r2.dev desactivado) | No |

## `straton-bucket`

Media activa del sitio. Es el único bucket enlazado al Worker (`STRATON_BUCKET`).

Estado al cierre:

| Dato | Valor |
|---|---|
| Objetos | 121 |
| Bytes | 12.832.906 |
| `products/` | 121 |
| `events/` | 0 |

`events/` = 0 describe solo el estado actual: las imágenes históricas de eventos siguen en
`products/`, y desde el deploy de `93bbfce5` las nuevas cargas del panel de Eventos se
guardan en `events/`.

Auditoría final:

| Dato | Valor |
|---|---|
| Referencias directas desde D1 | 41 |
| Variantes protegidas (`-640` / `-1280`) | 80 |
| Objetos protegidos (closure) | 121 |
| Objetos fuera del closure | 0 |
| Referencias de D1 rotas | 0 |
| Candidatos de limpieza pendientes conocidos | 0 |

El closure protegido se calcula así: toda key referenciada desde D1 (`products.image_url`,
`products.gallery_json`, `services.image_url`, `pages.content_json`,
`events.before_media_url`, `events.after_media_url`, `events.gallery_json`,
`testimonials.avatar_url`), más las variantes `-640` y `-1280` de cada original
`products/*.webp` referenciado, porque el renderer (`imgVariants()` / `imgVariantsServer()`)
las pide en el `srcset`. El renderer nunca genera variantes `-1600`. KV y el runtime
(`src/`, `public/`) no referencian ninguna key concreta.

## `straton-backups`

Recuperación temporal. Privado, sin binding del Worker, r2.dev desactivado, sin dominios
custom.

Lifecycle: `expire-backups-90d`, **90 días, sin filtro de prefijo** (alcanza a todo el
bucket), más la regla por defecto que aborta multipart uploads incompletos.

Contenido al cierre (28 objetos):

- `d1/`: los 2 objetos del backup de D1 del 2026-09-24 (export SQL y su manifest). El
  export contiene PII: no se descarga al repo ni se copia a otros buckets.
- `r2-orphans/2026-09-24/`: 26 objetos, 25 imágenes (4.253.566 bytes) y `manifest.json`.

Las 25 imágenes son los huérfanos fuertes retirados de `straton-bucket` en la limpieza: no
los referenciaba D1, KV ni el runtime, ni tampoco ningún snapshot histórico. El manifest
registra para cada uno la key de origen, tamaño, ETag, fecha y SHA-256. El backup es
**deliberadamente temporal**: expirará por el lifecycle hacia el 2026-12-23.

## `straton-archive`

Archivo histórico durable, creado el 2026-09-25. Privado, r2.dev desactivado, 0 dominios
custom, 0 bindings de Workers, sin Data Catalog, Sippy desactivado, sin CORS y sin reglas
de expiración de objetos. Su único lifecycle es la regla por defecto
`Default Multipart Abort Rule`.

Prefijo `sonido-history/2026-09/`: 11 objetos, 10 imágenes (1.325.502 bytes) y
`manifest.json`.

| Manifest | Valor |
|---|---|
| ETag | `1dedaf78151ff26f744a0d5f1a5a3c2a` |
| Tamaño | 13.497 bytes |
| SHA-256 | `54334f0d8bc294ace679001f6cc8d2f5ac31281ac51b4eb8c67a03c625ee15d9` |

El manifest remoto es la fuente detallada: key de origen y de archivo, tamaño, ETag,
fecha, Content-Type y SHA-256 de cada imagen, el estado histórico que la usa y las 5 keys
`.jpeg` reconstruibles. Cada imagen se conserva bajo su key original, por ejemplo
`sonido-history/2026-09/products/61af7dc4-3124-4a65-9ac1-f1a1acb9a157.webp`.

## Limpieza realizada

| Paso | Objetos | Bytes |
|---|---|---|
| Estado inicial auditado de `straton-bucket` | 161 | 19.352.942 |
| Retirada 1: huérfanos fuertes | −25 | −4.253.566 |
| Retirada 2: objetos históricos de `/sonido` | −15 | −2.266.470 |
| **Estado final** | **121** | **12.832.906** |
| Total retirado del bucket activo | 40 | 6.520.036 |

Nada de lo retirado se perdió:

- Los **25 huérfanos** tienen backup temporal en `straton-backups/r2-orphans/2026-09-24/`.
- De los **15 históricos**, 10 tienen archivo durable en
  `straton-archive/sonido-history/2026-09/`.
- Las otras 5 (`.jpeg`) son reconstruibles desde objetos vivos: eran byte a byte idénticas a
  sus sucesoras `.webp`, que siguen en `straton-bucket`.

Cada borrado se hizo key por key con `--remote`, después de respaldar y verificar por
SHA-256, y comprobando la ausencia de cada key con un listado posterior. Las URLs
retiradas responden 404 y no estaban cacheadas.

## Snapshots históricos de `/sonido`

Los estados E1–E4 guardados en `audit/d1-backup/` son ahora **documentales**, no rollbacks
automáticos completos: la media que citan ya no está en `straton-bucket`.

Grupos de media:

- **A**, 5 `.jpeg`: `products/{46224921-fec3-401d-abd3-672b7b84b011, 7de74943-0533-4c11-8940-f9d0ead29c13, 838d38b1-8d54-4308-acff-a19b7c941e4a, f35d3ef3-8d5e-4c3e-88af-2e38aa2fc60f, fc4f0be4-5af1-44fa-9d13-2bc3ca816e53}.jpeg`.
- **B**, `products/61af7dc4-3124-4a65-9ac1-f1a1acb9a157` (original, `-640`, `-1280`).
- **C**, `products/7d67c887-92ef-46d3-a1da-d428217f6177` (original, `-640`, `-1280`).
- **D**, originales de hero `products/9d40c561-e02f-4881-a621-644863b6d044.webp` y
  `products/accb711a-e3ea-4a26-8115-e2dbe9029e4c.webp`.
- **E**, `-1600` de esos dos heros.

B, C, D y E están en `straton-archive`. A es reconstruible desde `straton-bucket`.

| Estado | Snapshots | Media | ¿Restaurable? |
|---|---|---|---|
| E1: `/sonido` antes de la actualización del 2026-09-08 | `pages-id3-2026-09-08_160432.json`, `prod-pages-id3-pre-update.json` | B, C, D | **No fielmente.** Ver abajo |
| E2: propuesta aplicada el 2026-09-08 | `sonido-proposed-2026-09-08.json`, `update-sonido.sql`, `sonido-prod-before-fase5-20260908.json` | B, C, D | **No fielmente.** Ver abajo |
| E3: fase 5, 2026-09-08 | `sonido-nuevo-fase5-20260908.json`, `update-sonido-fase5.sql` | B, C, E | Sí, restaurando antes B, C y E |
| E4: antes del renombre `.jpeg` → `.webp`, 2026-09-10 | `sonido-pre-renombre-2026-09-10.json`, `sonido-content-pre-renombre.txt`, `sonido-restaurar.sql`, `pages-antes-fix-gradiente-2026-09-10.json` | A | Sí, recreando antes las 5 `.jpeg` |

- **E1 / E2:** usan `9d40c561.webp` y `accb711a.webp` como fondo de hero. El renderer actual
  les emite un `srcset` con variantes `-640` / `-1280` que **nunca existieron**, así que el
  hero quedaría sin imagen aunque se restaure la media archivada. Harían falta esas
  variantes nuevas o reescribir las URLs.
- **E3:** se puede reconstruir si primero se copian desde `straton-archive` las keys de B, C
  y E a sus paths originales en `straton-bucket`.
- **E4:** requiere recrear las 5 keys `.jpeg`: copiar los bytes de la `.webp` viva del mismo
  UUID a la key histórica `.jpeg`, con Content-Type `image/webp`. Restaurar E4 **reintroduce
  además el defecto** que motivó el renombre: una URL `.jpeg` no recibe `srcset`, así que el
  navegador descarga la imagen de 1600 px para cajas pequeñas.
  `pages-antes-fix-gradiente-2026-09-10.json` guarda además las tres páginas de ese
  momento, incluida la página de prueba borrada después.

Copiar una key de vuelta a `straton-bucket` (ejemplo):

```bash
npx wrangler r2 object get straton-archive/sonido-history/2026-09/products/<key> --remote --file <tmp>
npx wrangler r2 object put straton-bucket/products/<key> --remote --file <tmp> --content-type image/webp
```

Después, volver a descargar la key restaurada y comparar su SHA-256, tamaño y Content-Type
con el manifest.

## Reglas de restauración

- No restaurar un snapshot antiguo de D1 sin revisar antes sus URLs `/api/media/`.
- Restaurar primero en `straton-bucket` las media keys que falten y después el contenido de
  D1.
- Después de copiar, verificar SHA-256, tamaño y Content-Type contra el manifest; el ETag
  por sí solo no basta.
- `straton-archive` nunca debe servirse directamente como media de producción.
- No agregar `straton-archive` ni `straton-backups` como binding sin una decisión explícita
  de arquitectura.
- Time Travel de D1 no restaura R2: vuelve el contenido, pero no las imágenes borradas.
