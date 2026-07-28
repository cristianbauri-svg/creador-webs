-- 010_products_free_category.sql
-- Elimina el CHECK constraint restrictivo de category en products, para
-- permitir categorías de texto libre desde el dashboard (con sugerencias
-- vía datalist). SQLite no soporta ALTER TABLE para modificar un CHECK
-- constraint existente, así que se reconstruye la tabla.
-- El resto del esquema (service_type, status, sus CHECKs y defaults) se
-- preserva sin cambios — esta migración solo toca category.

CREATE TABLE products_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    service_type TEXT NOT NULL CHECK(service_type IN ('Venta', 'Alquiler')),
    description TEXT,
    features TEXT,
    image_url TEXT,
    gallery_json TEXT,
    active INTEGER DEFAULT 1,
    status TEXT DEFAULT 'draft' CHECK(status IN ('draft', 'published')),
    sort_order INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO products_new (id, title, category, service_type, description, features, image_url, gallery_json, active, status, sort_order, created_at)
SELECT id, title, category, service_type, description, features, image_url, gallery_json, active, status, sort_order, created_at
FROM products;

DROP TABLE products;

ALTER TABLE products_new RENAME TO products;
