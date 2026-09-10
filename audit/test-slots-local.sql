-- Página de prueba SOLO LOCAL (wrangler dev) para verificar los slots
-- horizontal/vertical y los ojos de visibilidad del hero y del bloque Imagen.
-- No ejecutar con --remote.
--
-- Imágenes reales del R2 local:
--   H = /api/media/products/demo0001-horiz-16x9.webp  (2000x1414)
--   V = /api/media/products/demo0000-vert-9x16.webp   (1080x1920)
--
-- Casos cubiertos:
--   bloque #0 hero  : ambos slots, los 4 ojos abiertos
--   bloque #1 image : ambos slots, los 4 ojos abiertos
--   bloque #2 image : slot vertical oculto en desktop -> desktop cae al horizontal
--   bloque #3 image : slot horizontal oculto en móvil  -> móvil usa el vertical
--   bloque #4 image : los 4 ojos cerrados              -> no se ve en ningún lado
--   bloque #5 hero  : sin claves nuevas (retrocompatibilidad)

DELETE FROM pages WHERE id = 9999;

INSERT INTO pages (id, slug, title, content_json, status, updated_at)
VALUES (
  9999,
  'zz-test-slots',
  'Prueba slots responsive',
  '[
    {"type":"hero","props":{
      "bg_type":"","bg_url":"/api/media/products/demo0001-horiz-16x9.webp",
      "bg_url_mobile":"/api/media/products/demo0000-vert-9x16.webp",
      "bg_url_visible_desktop":true,"bg_url_visible_mobile":true,
      "bg_url_mobile_visible_desktop":true,"bg_url_mobile_visible_mobile":true,
      "title":"Hero con dos slots","subtitle":"Desktop usa la horizontal; movil, la vertical.",
      "button_text":"COTIZAR","button_link":"","button_style":"3"}},

    {"type":"image","props":{
      "url":"/api/media/products/demo0001-horiz-16x9.webp",
      "url_mobile":"/api/media/products/demo0000-vert-9x16.webp",
      "url_visible_desktop":true,"url_visible_mobile":true,
      "url_mobile_visible_desktop":true,"url_mobile_visible_mobile":true,
      "alt":"Bloque imagen con dos slots","caption":"Ambos slots visibles en ambos dispositivos."}},

    {"type":"image","props":{
      "url":"/api/media/products/demo0001-horiz-16x9.webp",
      "url_mobile":"/api/media/products/demo0000-vert-9x16.webp",
      "url_visible_desktop":true,"url_visible_mobile":true,
      "url_mobile_visible_desktop":false,"url_mobile_visible_mobile":true,
      "alt":"Vertical oculta en desktop","caption":"La vertical esta oculta en desktop: cae a la horizontal. En movil usa la vertical."}},

    {"type":"image","props":{
      "url":"/api/media/products/demo0001-horiz-16x9.webp",
      "url_mobile":"/api/media/products/demo0000-vert-9x16.webp",
      "url_visible_desktop":true,"url_visible_mobile":false,
      "url_mobile_visible_desktop":false,"url_mobile_visible_mobile":true,
      "alt":"Horizontal oculta en movil","caption":"La horizontal esta oculta en movil: en movil solo se ve la vertical."}},

    {"type":"image","props":{
      "url":"/api/media/products/demo0001-horiz-16x9.webp",
      "url_mobile":"/api/media/products/demo0000-vert-9x16.webp",
      "url_visible_desktop":false,"url_visible_mobile":false,
      "url_mobile_visible_desktop":false,"url_mobile_visible_mobile":false,
      "alt":"Todo oculto","caption":"Los cuatro ojos cerrados: este bloque no muestra imagen en ningun dispositivo."}},

    {"type":"image","props":{
      "url":"/api/media/products/demo0001-horiz-16x9.webp",
      "alt":"Pagina antigua, sin claves nuevas","caption":"Retrocompatibilidad: una pagina creada antes de los slots se ve igual que siempre."}}
  ]',
  'published',
  datetime('now')
);
