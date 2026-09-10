-- 013_pages_bg_color.sql
-- Fondo de página: el canvas que se ve detrás de los bloques (el espacio entre
-- uno y otro, y arriba y abajo del primero y el último).
--
-- Mismo convenio que el bg_color de los bloques: un solo campo de texto libre
-- que el render escribe con el shorthand `background`, así acepta tanto un color
-- sólido (#0A0A0A) como un degradado CSS (linear-gradient(...)).
-- Vacío = sin fondo propio: la página se ve sobre el fondo del body, igual que
-- antes de esta migración.
ALTER TABLE pages ADD COLUMN bg_color TEXT;
