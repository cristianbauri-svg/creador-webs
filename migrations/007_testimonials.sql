-- 007_testimonials.sql
-- Testimonios de clientes

CREATE TABLE IF NOT EXISTS testimonials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name TEXT NOT NULL,
    company TEXT,
    quote TEXT NOT NULL,
    event_id INTEGER REFERENCES events(id),
    avatar_url TEXT,
    visible INTEGER DEFAULT 0,
    status TEXT DEFAULT 'draft',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
