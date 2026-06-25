-- 002_quotations.sql
-- Tabla de cotizaciones

CREATE TABLE IF NOT EXISTS quotations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT,
    email TEXT,
    phone TEXT,
    company TEXT,
    city TEXT,
    event_date TEXT,
    notes TEXT,
    products_json TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'contacted', 'quoted', 'closed')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
