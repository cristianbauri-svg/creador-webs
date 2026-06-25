-- 005_packages.sql
-- Paquetes comerciales

CREATE TABLE IF NOT EXISTS packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price_range TEXT,
    includes_json TEXT,
    recommended_event_type TEXT,
    status TEXT DEFAULT 'draft',
    sort_order INTEGER DEFAULT 0
);
