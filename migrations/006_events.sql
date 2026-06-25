-- 006_events.sql
-- Portafolio de eventos realizados

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    event_type TEXT CHECK(event_type IN ('corporativo', 'social', 'concierto')),
    solution TEXT,
    result TEXT,
    before_media_url TEXT,
    after_media_url TEXT,
    gallery_json TEXT,
    status TEXT DEFAULT 'draft',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
