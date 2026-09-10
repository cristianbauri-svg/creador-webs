-- Página de prueba LOCAL (solo D1 local, nunca producción).
-- Verifica que el srcset de los bloques Cards y Galería apunte a variantes que
-- existen de verdad. Las imágenes usadas se subieron con uploadFile() del admin,
-- que ahora genera -640 / -1280 en el momento de subir.
DELETE FROM pages WHERE id = 9998;

INSERT INTO pages (id, slug, title, content_json, meta_title, meta_description, status, updated_at)
VALUES (
  9998,
  'zz-test-srcset',
  'ZZ Test srcset variantes',
  '[
    {"type":"cards","props":{
      "section_title":"Cards con variantes",
      "button_style":"primary",
      "cards":[
        {"title":"Card 1","description":"Imagen con variantes -640/-1280","image":"/api/media/products/dd1b76fc-d4ef-4859-be8f-024f5a63e66c.webp"},
        {"title":"Card 2","description":"Misma imagen, segunda card","image":"/api/media/products/dd1b76fc-d4ef-4859-be8f-024f5a63e66c.webp"},
        {"title":"Card 3","description":"Misma imagen, tercera card","image":"/api/media/products/dd1b76fc-d4ef-4859-be8f-024f5a63e66c.webp"},
        {"title":"Card 4","description":"Misma imagen, cuarta card","image":"/api/media/products/dd1b76fc-d4ef-4859-be8f-024f5a63e66c.webp"}
      ]
    }},
    {"type":"gallery","props":{
      "section_title":"Galeria con variantes",
      "images":[
        {"url":"/api/media/products/dd1b76fc-d4ef-4859-be8f-024f5a63e66c.webp","alt":"Galeria 1"},
        {"url":"/api/media/products/dd1b76fc-d4ef-4859-be8f-024f5a63e66c.webp","alt":"Galeria 2"},
        {"url":"/api/media/products/dd1b76fc-d4ef-4859-be8f-024f5a63e66c.webp","alt":"Galeria 3"},
        {"url":"/api/media/products/dd1b76fc-d4ef-4859-be8f-024f5a63e66c.webp","alt":"Galeria 4"}
      ]
    }}
  ]',
  'ZZ Test srcset',
  'Pagina de prueba local',
  'published',
  '2026-09-01 00:00:00'
);
