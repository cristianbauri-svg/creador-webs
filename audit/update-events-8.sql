-- Apunta la fila 8 de events a la version WebP de su portada.
--
-- Valor viejo (respaldo en audit/tmp/events-8-antes.json):
--   ["/api/media/products/9fabf1d2-beb8-4abd-b03a-9bed5febe839.png"]
--
-- El WHERE exige ese valor exacto: si alguien cambio la fila mientras tanto,
-- el UPDATE afecta 0 filas en vez de pisar el cambio. Los objetos WebP ya
-- existen y sirven (HTTP 200, image/webp), asi que el cambio no puede dejar
-- una imagen rota.
UPDATE events
   SET gallery_json = '["/api/media/products/9fabf1d2-beb8-4abd-b03a-9bed5febe839.webp"]'
 WHERE id = 8
   AND gallery_json = '["/api/media/products/9fabf1d2-beb8-4abd-b03a-9bed5febe839.png"]';
