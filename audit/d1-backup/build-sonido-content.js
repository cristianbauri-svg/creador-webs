// Script de generación del nuevo content_json para /sonido (id=3).
// SOLO reutiliza texto ya verificado en el content_json existente.
// No inventa información comercial, técnica, precios, equipos ni datos nuevos.
//
// Cambios:
//   1. Hero (bloque original [2]): se rellena title (H1) y subtitle con
//      texto existente. Antes estaba vacío → no había H1.
//   2. Se elimina el section-header "ALQUILER DE SONIDO PROFESIONAL" ([0])
//      y su spacer ([1]) porque el Hero ya aporta el H1 (evita duplicado y
//      jerarquía H2 antes de H1).
//   3. Se elimina el bloque text [4] "Diseñamos sistemas..." porque su
//      contenido exacto pasa a ser el subtitle del Hero (sin pérdida de info).
//   4. Se fijan title / meta_title / meta_description (hoy null).
//   5. El resto de bloques se conserva EXACTO.

const fs = require('fs');
const path = require('path');

const backupPath = path.join(__dirname, 'pages-id3-2026-09-08_160432.json');
const record = JSON.parse(fs.readFileSync(backupPath, 'utf8'));

const blocks = JSON.parse(record.content_json);
console.log('Bloques originales:', blocks.length);

// Verificar índices clave antes de tocar nada
const idx = (i) => JSON.stringify(blocks[i]);
console.log('[0] section-header:', idx(0));
console.log('[1] spacer      :', idx(1));
console.log('[2] hero         :', idx(2));
console.log('[3] text         :', idx(3));
console.log('[4] text         :', idx(4));

// ---- Transformaciones ----
// 1. Hero (índice 2): rellenar title + subtitle con texto existente
const hero = blocks[2];
if (hero.type !== 'hero') throw new Error('Bloque[2] no es hero, abortar');
hero.props.title = 'Alquiler de Sonido Profesional';
hero.props.subtitle = 'Diseñamos sistemas de sonido a la medida de tu evento, con equipos profesionales, montaje técnico y operación durante la jornada.';

// 2+3. Eliminar [0] section-header, [1] spacer, [4] text redundante
// (el orden de splice importa: de mayor a menor índice)
const remove = [4, 1, 0];
for (const i of remove) blocks.splice(i, 1);

console.log('Bloques tras cambios:', blocks.length);

// ---- Campos de página ----
const newTitle = 'Alquiler de Sonido Profesional';
const newMetaTitle = 'Alquiler de Sonido Profesional | Straton Audio';
const newMetaDescription = 'Diseñamos sistemas de sonido a la medida de tu evento, con equipos profesionales, montaje técnico y operación durante la jornada. Cobertura en Bogotá y Colombia.';

// ---- Validación ----
const newContentJson = JSON.stringify(blocks);
JSON.parse(newContentJson); // lanza si no es JSON válido

if (newMetaDescription.length > 160) {
  console.warn('⚠ meta_description supera 160 chars:', newMetaDescription.length);
} else {
  console.log('✓ meta_description length:', newMetaDescription.length);
}

// Verificar que el texto reutilizado sigue presente (no se perdió)
const allText = newContentJson;
const mustContain = [
  'Alquiler de Sonido Profesional',
  'Diseñamos sistemas de sonido a la medida de tu evento, con equipos profesionales, montaje técnico y operación durante la jornada.',
  'Tu evento merece algo más que unos parlantes.',
  'Equipos profesionales',
  'Montaje y desmontaje',
  'Técnico especializado',
  'Cobertura en Bogotá y Colombia',
  'Eventos corporativos',
  'Eventos sociales',
  'Conciertos y shows',
  'Congresos y conferencias',
  'Conocemos tu evento',
  'Analizamos el espacio',
  'Diseñamos el sistema',
  'Hacemos que suceda',
  'NO TODOS LOS EVENTOS SON IGUALES',
];
for (const s of mustContain) {
  if (!allText.includes(s)) {
    console.error('✗ FALTA texto verificado:', s);
    process.exit(1);
  }
}
console.log('✓ Todo el contenido verificado se conserva');

// Verificar H1: exactamente un hero con title no vacío
const heroesWithTitle = blocks.filter(b => b.type === 'hero' && b.props.title).length;
const heroesEmpty = blocks.filter(b => b.type === 'hero' && !b.props.title).length;
console.log(`✓ hero con H1: ${heroesWithTitle} | hero sin title (banner): ${heroesEmpty}`);

// Verificar que no quedan section-header duplicando el H1
const sectionHeaders = blocks.filter(b => b.type === 'section-header').map(b => b.props.title);
console.log('✓ section-headers restantes:', JSON.stringify(sectionHeaders));

// ---- Salida ----
const out = {
  id: record.id,
  slug: record.slug,
  title: newTitle,
  meta_title: newMetaTitle,
  meta_description: newMetaDescription,
  content_json: newContentJson,
  status: record.status,
};

const outPath = path.join(__dirname, 'sonido-proposed-2026-09-08.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');

console.log('\n=== SALIDA ===');
console.log('title           :', newTitle);
console.log('meta_title      :', newMetaTitle);
console.log('meta_description:', newMetaDescription);
console.log('content_json length:', newContentJson.length, 'chars |', blocks.length, 'bloques');
console.log('Escrito en:', outPath);
