const fs = require('fs');
const path = require('path');
const prop = JSON.parse(fs.readFileSync(path.join(__dirname, 'sonido-proposed-2026-09-08.json'), 'utf8'));

const cj = prop.content_json;
const singles = (cj.match(/'/g) || []).length;
console.log('comillas simples en content_json:', singles);

const esc = (s) => s.replace(/'/g, "''");

const sql =
  'UPDATE pages\n' +
  "SET title = '" + esc(prop.title) + "',\n" +
  "    meta_title = '" + esc(prop.meta_title) + "',\n" +
  "    meta_description = '" + esc(prop.meta_description) + "',\n" +
  "    content_json = '" + esc(cj) + "',\n" +
  "    updated_at = CURRENT_TIMESTAMP\n" +
  "WHERE id = 3 AND slug = 'sonido';\n";

fs.writeFileSync(path.join(__dirname, 'update-sonido.sql'), sql, 'utf8');
console.log('SQL generado en:', path.join(__dirname, 'update-sonido.sql'));
console.log('--- Vista previa (WHERE + primeros chars) ---');
console.log(sql.slice(0, 500));
console.log('...\nWHERE clause:', sql.slice(sql.indexOf('WHERE')));
