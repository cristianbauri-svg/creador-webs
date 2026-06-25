-- 001_products.sql
-- Tabla de productos (equipos de audio, iluminación, etc.)

CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('Audio', 'Pantallas LED', 'Proyectores', 'Iluminación', 'Otros')),
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
