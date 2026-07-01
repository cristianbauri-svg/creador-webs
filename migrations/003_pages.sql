-- 003_pages.sql
-- Contenido editable de cada sección de la landing

CREATE TABLE IF NOT EXISTS pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    title TEXT,
    content_json TEXT,
    meta_title TEXT,
    meta_description TEXT,
    status TEXT DEFAULT 'draft',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
