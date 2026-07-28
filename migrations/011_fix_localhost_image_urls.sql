-- 011_fix_localhost_image_urls.sql
-- Corrige image_url/gallery_json/avatar_url/media_url que quedaron apuntando
-- a un host de desarrollo local (http://127.0.0.1:8788) en vez del dominio
-- real de producción. Causa raíz corregida en src/routes/upload.ts (ahora
-- guarda rutas relativas); esto repara los registros ya existentes.
--
-- IMPORTANTE: revisar el puerto exacto (8788 aquí) contra los datos reales
-- de la D1 de producción antes de ejecutar remoto — puede diferir según en
-- qué puerto corrió wrangler dev cuando se subieron esas imágenes.

UPDATE products
SET image_url = REPLACE(image_url, 'http://127.0.0.1:8788', 'https://stratonaudio.com.co')
WHERE image_url LIKE 'http://127.0.0.1:8788%';

UPDATE products
SET gallery_json = REPLACE(gallery_json, 'http://127.0.0.1:8788', 'https://stratonaudio.com.co')
WHERE gallery_json LIKE '%127.0.0.1:8788%';

UPDATE services
SET image_url = REPLACE(image_url, 'http://127.0.0.1:8788', 'https://stratonaudio.com.co')
WHERE image_url LIKE 'http://127.0.0.1:8788%';

UPDATE testimonials
SET avatar_url = REPLACE(avatar_url, 'http://127.0.0.1:8788', 'https://stratonaudio.com.co')
WHERE avatar_url LIKE 'http://127.0.0.1:8788%';

UPDATE events
SET before_media_url = REPLACE(before_media_url, 'http://127.0.0.1:8788', 'https://stratonaudio.com.co')
WHERE before_media_url LIKE 'http://127.0.0.1:8788%';

UPDATE events
SET after_media_url = REPLACE(after_media_url, 'http://127.0.0.1:8788', 'https://stratonaudio.com.co')
WHERE after_media_url LIKE 'http://127.0.0.1:8788%';

UPDATE events
SET gallery_json = REPLACE(gallery_json, 'http://127.0.0.1:8788', 'https://stratonaudio.com.co')
WHERE gallery_json LIKE '%127.0.0.1:8788%';
