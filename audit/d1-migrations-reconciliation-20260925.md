# Estado y reconciliación de migraciones D1 — 2026-09-25

> **Estado vigente:** la reconciliación se completó el 2026-09-25 (fase D1-M2). El
> resultado está en la sección siguiente. Todo lo que aparece bajo «Diagnóstico previo a la
> reconciliación» es historial: describe el estado anterior y ya no es una instrucción
> vigente.

## Resultado D1-M2 — reconciliación completada

| Dato | Valor |
|---|---|
| Fecha (UTC, aproximada) | 2026-09-25 02:15Z |
| Git | `5a2a9b2727aed236329c740e40854d622c510391` |
| Worker | `04a5d4ef-36c0-4dcf-8266-08a298d85dcb` |
| Deployment | `332e5b76-8aa7-4111-aeae-fbf32133f9b8` |

### Backup previo

| Objeto en `straton-backups` | Bytes | SHA-256 |
|---|---|---|
| `d1/straton-db-pre-d1-reconcile-2026-09-25T021152Z.sql` | 40.288 | `4ebb2fd2c2d81f1c420e44a5c28ae63b213e49db7fe2048a852d9fbce57dfbcd` |
| `d1/straton-db-pre-d1-reconcile-2026-09-25T021152Z.manifest.json` | 608 | — |

- El export completo contiene PII: no está en el repo ni en copias locales.
- El manifest solo guarda metadatos: bookmark, clave, tamaño y hash del SQL, y el resultado
  de la prueba de restauración.
- Antes de escribir en producción, el SQL se restauró en una SQLite local desechable:
  `integrity_check` dio ok, hubo 0 violaciones de foreign key, y las tablas, los conteos, el
  esquema y el fingerprint de `products` coincidieron con producción.
- Además, el SQL y el manifest se volvieron a descargar y resultaron idénticos.
- Vence por el lifecycle de 90 días de `straton-backups`.

### Bookmarks de Time Travel

| Bookmark | Momento | Papel |
|---|---|---|
| `00000ae5-00000000-000050f1-49358f1f39ee6e1cdd2df74b63b48021` | Preparación, antes del export (02:11:39Z) | Referencia inicial |
| `00000ae6-00000000-000050f1-daf04c68709fd94cc0cc35b7d6101f15` | Inmediatamente antes del primer INSERT remoto | **AUTHORITATIVE PRE-WRITE BOOKMARK** |

El export movió el bookmark sin escribir datos. Por eso, el punto de recuperación de esta
reconciliación es el segundo, mientras siga dentro de la retención de Time Travel. **No se
ejecutó ningún restore.**

### Procedimiento ejecutado

1. Se validó el backup y se restauró en local.
2. Se ensayó el procedimiento exacto en una D1 local desechable con datos sintéticos, con
   resultado limpio.
3. Tras una revalidación inmediata del estado, se insertaron en `d1_migrations`
   `012_events_link.sql` y `013_pages_bg_color.sql`, con un INSERT guardado por
   `NOT EXISTS` (1 fila cada uno).
4. `wrangler d1 migrations list --remote` mostró exclusivamente 010 y 011.
5. `wrangler d1 migrations apply --remote` ejecutó exclusivamente 010 y 011, y terminó sin
   errores.
6. 010 reconstruyó `products` y eliminó el CHECK de `category`.
7. 011 afectó 0 filas.
8. El `list` final respondió "No migrations to apply!".

Orden real de `d1_migrations` por id: 001–009, 012, 013, 010, 011. Es deliberado y no se
reordena: Wrangler identifica cada migración por su nombre.

### Estado final de D1

- `d1_migrations`: 13 nombres únicos, exactamente 001–013. No hay migraciones pendientes.
- `products`:
  - 12 columnas, con los mismos nombres, tipos, NOT NULL y defaults;
  - `category TEXT NOT NULL`, sin CHECK;
  - conserva los CHECK de `service_type` y `status`;
  - conserva `PRIMARY KEY AUTOINCREMENT`;
  - no existe `products_new`;
  - el DDL quedó guardado como `CREATE TABLE "products"`, un cambio solo cosmético.
- Datos de `products`: 6 filas, con ids entre 1 y 10. El fingerprint SHA-256 del conjunto
  (`2cf0be5d88ca3c6faf487ff5c7ed2cbe8beee7971de79e340617a190802f0600`) es idéntico antes y
  después.
- El producto 10 (`auth-test-post-deploy`, `draft`) sigue presente. Su limpieza será una
  operación separada.
- `sqlite_sequence(products)` = 10.
- Integridad en remoto:
  - `PRAGMA quick_check` = ok;
  - `PRAGMA foreign_key_check` = 0 violaciones;
  - D1 remoto bloqueó el `PRAGMA integrity_check` completo con SQLITE_AUTH; ese chequeo se
    hizo, con resultado ok, sobre la restauración local del backup.
- Los conteos del resto de las tablas y su esquema no cambiaron. Solo `d1_migrations` pasó
  de 9 a 13 filas.
- 011: quedan 0 valores con `localhost` o `127.0.0.1` en sus columnas.
- 012: `events.link` sigue siendo una sola columna y conserva sus datos.
- 013: `pages.bg_color` sigue siendo una sola columna y conserva sus datos.
- El Worker no cambió (no hubo deploy) y `straton-bucket` tampoco.

Después (fase D1-M3), `test/fixtures/d1-schema.ts` pasó a reflejar el esquema de
`products` sin el CHECK de `category`, y se agregó una prueba de API que crea un producto
con una categoría libre.

## Diagnóstico previo a la reconciliación (historial)

Fotografía **previa a la reconciliación**, tomada con producción en el commit
`d9001f337f78ceaeac6faf85f48cf77a05c92e51` y el Worker
`04a5d4ef-36c0-4dcf-8266-08a298d85dcb`.

Fuentes:

- **Auditoría D1-M1** sobre la D1 de producción: solo `SELECT` y `PRAGMA`, con
  `rows_written = 0` en todas las consultas.
- **Simulación** en una D1 local desechable, con el esquema exacto de producción
  (leído de `sqlite_master`), el mismo registro de migraciones y datos sintéticos
  sin PII.

Nada de esto escribió en la D1 de producción.

### Registro y matriz

`migrations/` contiene de la 001 a la 013. La tabla `d1_migrations` de producción
registra únicamente 001–009, aplicadas el 2026-07-10.

| Migración | Registrada | Efecto presente | Evidencia histórica | Estado | Si se ejecuta hoy |
|---|---|---|---|---|---|
| `010_products_free_category.sql` | No | **No**: `products` conserva el CHECK de `category` y su DDL es el de 001 | El commit `d850892` (2026-07-28) crea el archivo; nada afirma que se haya ejecutado | **Pendiente real** | Elimina el CHECK restrictivo de `products.category` |
| `011_fix_localhost_image_urls.sql` | No | Sin efecto pendiente: ninguna fila coincide con sus `WHERE` | El commit `9dd9649` (2026-07-28) crea el archivo; la historia de ejecución **no es demostrable** | Equivalente hoy / no-op | 7 `UPDATE` que tocan 0 filas |
| `012_events_link.sql` | No | Sí: existe `events.link` | El commit `279f0ce` (2026-08-11) crea el archivo, sin afirmar que se haya ejecutado en producción | Efecto aplicado, no registrado | **Falla**: `duplicate column name: link` |
| `013_pages_bg_color.sql` | No | Sí: existe `pages.bg_color` | El commit `85c1970` (2026-09-10) dice explícitamente "Migracion 013 ya aplicada en produccion" | Efecto aplicado, con evidencia explícita, no registrado | **Falla** por columna duplicada |

Sobre 011: todas las URLs de las columnas que toca son relativas (`/api/media/…`) y no
quedan `127.0.0.1` ni `localhost`. Por eso hoy sería un no-op. Eso no prueba que
alguna vez se haya ejecutado.

### Qué haría hoy un `apply` remoto

Wrangler considera pendientes 010, 011, 012 y 013. En la simulación, un
`wrangler d1 migrations apply` normal hizo esto:

| Migración | Resultado |
|---|---|
| 010 | Se aplica y se registra |
| 011 | Se aplica (0 filas) y se registra |
| 012 | Falla con `duplicate column name: link`; esa migración se revierte y el proceso se detiene |
| 013 | No llega a ejecutarse |

Después, `d1_migrations` quedaría en 001–011, y cualquier `apply` posterior volvería
a fallar en 012, bloqueando también las migraciones 014 en adelante. Sin terminal
interactiva (un agente o un CI), Wrangler acepta la confirmación solo.

**Por lo tanto, el `apply` remoto directo está bloqueado.**

### `migrations list` no es solo lectura

En Wrangler 4.139.0, `wrangler d1 migrations list` ejecuta primero
`CREATE TABLE IF NOT EXISTS d1_migrations(…)` para inicializar la tabla, igual que
`apply`, y después lista. Con la tabla ya creada es un no-op, pero es DDL remoto: no
tratarlo como una operación de solo `SELECT` cuando una fase exige cero DDL. Para
leer el registro basta con `SELECT * FROM d1_migrations ORDER BY id`.

### Migración 010

`products` conserva hoy `CHECK(category IN ('Audio', 'Pantallas LED', 'Proyectores',
'Iluminación', 'Otros'))`.

La reconstrucción de 010 (`products_new` → `INSERT … SELECT` → `DROP` → `RENAME`)
conserva:

- las 12 columnas, en el mismo orden y con los mismos tipos;
- los `NOT NULL` y los defaults;
- los CHECK de `service_type` y de `status`;
- `PRIMARY KEY` con `AUTOINCREMENT`.

Solo elimina el CHECK restrictivo de `category`. El DDL guardado pasa a
`CREATE TABLE "products"`, un cambio solo cosmético.

`products` no tiene índices propios, triggers, vistas ni foreign keys relacionadas:
la única foreign key de la base es `testimonials.event_id → events`. En la
simulación, las filas quedaron idénticas, no sobró ninguna tabla `products_new` y
`sqlite_sequence` se conservó.

**Incompatibilidad funcional actual:** el panel ofrece "+ Crear nueva categoría",
pero D1 todavía rechaza cualquier categoría fuera del CHECK. La API no valida
`category`, así que el alta o la edición terminan en 500.

`test/fixtures/d1-schema.ts` reproduce el CHECK actual: si se aplica 010, ese
fixture debe actualizarse en la misma fase.

### Hardening ya activo

Antes de reconciliar 010 se desplegó el commit
`d9001f337f78ceaeac6faf85f48cf77a05c92e51` (Worker
`04a5d4ef-36c0-4dcf-8266-08a298d85dcb`).

Cambio: `updateProduct` ejecuta primero el UPDATE en D1 y, solo si tuvo éxito,
pide borrar la imagen antigua de R2. Antes pedía el borrado primero, y un UPDATE
rechazado (por ejemplo por un CHECK) podía dejar la fila apuntando a una imagen ya
borrada.

Pruebas: 118/118. La regresión fuerza el rechazo con el CHECK de `service_type`,
que 010 conserva, para que siga siendo válida después de la reconciliación.

### Producto id 10

`products.id = 10`, `title = auth-test-post-deploy`, `status = draft`.

**No borrarlo antes de 010.** Hoy `sqlite_sequence(products) = 10` y `MAX(id) = 10`,
y en esas condiciones la reconstrucción de 010 conserva la secuencia. Si el producto
10 se borrara antes, la reconstrucción podría bajar `sqlite_sequence` a 5 y permitir
que se reutilicen los ids 6–10. Su limpieza queda para después de 010.

### Opciones de reconciliación

**Ninguna se ejecutó.** Lo que se sabe:

- Wrangler 4.139.0 no tiene una opción oficial para marcar una migración como
  aplicada: los comandos son `create`, `list` y `apply`, y `apply` no permite saltar
  ni marcar migraciones.
- 012 y 013 necesitan reconciliar su registro **sin** volver a ejecutar su SQL.
- 010 sí necesita aplicarse.
- 011 puede ejecutarse hoy como no-op, pero debe quedar registrada.

Opciones estudiadas, de más a menos segura:

1. **Registrar 012 y 013, y después aplicar 010 y 011 con el mecanismo normal.**
   Wrangler ejecuta cada migración junto con su registro, así que cada una se
   aplica y se registra como una unidad. El registro queda coherente de la 001 a la
   013 y las 014+ vuelven a funcionar. Registrar 012 y 013 se deshace borrando
   esas dos filas.
2. **Ejecutar el SQL pendiente a mano y registrar las cuatro después.** Llega al
   mismo estado final, pero el SQL y el registro quedan en pasos separados: si algo
   se interrumpe entre ambos, el desfase vuelve.
3. **Una migración nueva de reconciliación.** Por sí sola no evita que 012 falle,
   porque Wrangler aplica en orden. Obligaría a reescribir 012 y 013, que no se
   pueden volver idempotentes en SQLite (no existe `ADD COLUMN IF NOT EXISTS`), y a
   alterar la historia de `migrations/`. Es la menos segura.

El procedimiento exacto de escritura se decidirá y autorizará en una fase
posterior. Antes de escribir, incluirá un export de D1 a `straton-backups` y un
bookmark de Time Travel.
