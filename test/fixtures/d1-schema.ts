// Esquema de D1 para las pruebas: copia literal de sqlite_master en
// producción (consultado el 2026-09-24; products, tras aplicar la migración 010
// el 2026-09-25, ya no tiene el CHECK de category), con IF NOT EXISTS. Solo se aplica a
// la base efímera que crea vitest-pool-workers para las pruebas; nunca a la
// base de producción ni a la local de `wrangler dev`.

const TABLES: Array<[name: string, ddl: string]> = [
  ["events", `CREATE TABLE IF NOT EXISTS events (
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
, link TEXT)`],
  ["packages", `CREATE TABLE IF NOT EXISTS packages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price_range TEXT,
    includes_json TEXT,
    recommended_event_type TEXT,
    status TEXT DEFAULT 'draft',
    sort_order INTEGER DEFAULT 0
, featured INTEGER DEFAULT 0)`],
  ["pages", `CREATE TABLE IF NOT EXISTS pages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    slug TEXT UNIQUE NOT NULL,
    title TEXT,
    content_json TEXT,
    meta_title TEXT,
    meta_description TEXT,
    status TEXT DEFAULT 'draft',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
, bg_color TEXT)`],
  ["products", `CREATE TABLE IF NOT EXISTS products (
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
)`],
  ["quotations", `CREATE TABLE IF NOT EXISTS quotations (
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
)`],
  ["services", `CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    image_url TEXT,
    sort_order INTEGER DEFAULT 0,
    status TEXT DEFAULT 'draft',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
, features TEXT)`],
  ["testimonials", `CREATE TABLE IF NOT EXISTS testimonials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_name TEXT NOT NULL,
    company TEXT,
    quote TEXT NOT NULL,
    event_id INTEGER REFERENCES events(id),
    avatar_url TEXT,
    visible INTEGER DEFAULT 0,
    status TEXT DEFAULT 'draft',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`],
];

/** Crea las tablas si faltan y las deja vacías. testimonials se vacía antes
 *  que events por su clave foránea. */
export async function resetTables(db: D1Database): Promise<void> {
  for (const [, ddl] of TABLES) {
    await db.prepare(ddl).run();
  }
  for (const name of ["testimonials", "events", "packages", "pages", "products", "quotations", "services"]) {
    await db.prepare(`DELETE FROM ${name}`).run();
  }
}
