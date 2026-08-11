-- 012_events_link.sql
-- Agrega columna "link" a la tabla events para enlazar cards del portafolio
-- a páginas externas o páginas dinámicas internas.

ALTER TABLE events ADD COLUMN link TEXT;
