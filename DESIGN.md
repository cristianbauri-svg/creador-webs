<!-- SEED: re-run /impeccable document once there's code to capture the actual tokens and components. -->

---
name: Curso de Diseño de Uñas
description: Formación profesional premium en nail design — elegancia, calidez y excelencia técnica.
---

# Design System: Curso de Diseño de Uñas

## 1. Overview

**Creative North Star: "El Estudio Boutique"**

Un espacio luminoso, sereno y acogedor donde la experiencia habla en voz baja. Como un estudio de nail design de alto nivel: luz natural, materiales nobles, superficies limpias, y una paleta contenida que deja que el trabajo hable por sí mismo. Nada de gritos visuales; cada elemento está elegido con la precisión de quien domina su oficio.

La personalidad es **elegante, cálida y cercana** — una mentora que te recibe por tu nombre en un espacio impecable. El diseño respira. La contención es el lujo. La calidez viene de la luz y la textura, no de colores "alegres" ni decoración.

Este sistema rechaza explícitamente:
- Lo cursi y barato: cero rosa saturado, tipografías script, brillos excesivos
- Lo frío y corporativo: cero fondos blancos estériles, paletas azul-gris SaaS, íconos genéricos
- Lo recargado: cero dorados excesivos, ornamentos, ni estética "palacio versallesco"

**Key Characteristics:**
- Paleta contenida: neutros cálidos tintados + un acento refinado usado con moderación
- Tipografía sans-serif única en juego de pesos — la jerarquía viene del peso, no del cambio de familia
- Movimiento responsable: transiciones sutiles, revelaciones suaves al scroll, sin coreografía excesiva
- Espacio generoso, ritmo editorial, luz como material de diseño

## 2. Colors

Una paleta **restrained**: neutros cálidos tintados sutilmente hacia el acento de la marca, con un solo color de acento usado en ≤10% de cualquier superficie. La contención es la elegancia.

**The One Voice Rule.** El acento de marca aparece en ≤10% de cualquier pantalla. Su rareza es el punto. Si empieza a sentirse ubicuo, se diluye.

### Primary
- **[Acento de Marca]** ([a definir durante implementación]): Un tono refinado y contenido — como un esmalte de uñas de alta gama. Dirección: rosa empolvado profundo, terracota suave, o borgoña atenuado. Uso: CTAs principales, enlaces, acentos puntuales.

### Neutral
- **[Fondo Principal]** ([a definir]): Cálido sin ser crema. Blanco roto con un matiz mínimo hacia el acento de marca. Luminoso pero no estéril.
- **[Fondo Alterno]** ([a definir]): Un paso más oscuro que el fondo principal. Para secciones que necesitan respirar distinto.
- **[Texto Principal]** ([a definir]): Casi negro con personalidad. No #000 puro — tintado sutilmente.
- **[Texto Secundario]** ([a definir]): Gris medio con calidez. Contraste AA sobre el fondo principal.
- **[Borde / Divisor]** ([a definir]): Sutil, presente solo cuando es necesario.

## 3. Typography

**Primary Font:** Sans-serif única ([font pairing a elegir en implementación])
**Dirección:** Geométrica-humanista con calidez. Ni técnica/robótica ni decorativa. Pesos múltiples para jerarquía dentro de una sola familia. Referencia: el sistema tipográfico de Glossier — limpio, accesible, femenino sin ser cursi.

**Character:** La jerarquía se construye con peso, tamaño y espacio — no con cambios de familia. Una sola voz tipográfica que susurra en los títulos y conversa en el cuerpo.

### Hierarchy
- **Display** (Light, clamp(2.5rem, 5vw, 4.5rem), 1.1): Hero headlines. Pocas palabras, máximo impacto.
- **Headline** (Regular, clamp(1.75rem, 4vw, 2.5rem), 1.2): Títulos de sección. Respiran con espacio.
- **Title** (Medium, clamp(1.25rem, 3vw, 1.5rem), 1.3): Subtítulos y cards destacadas.
- **Body** (Regular, 1rem/1.125rem, 1.6): Texto de lectura. Max 65–75ch de ancho de línea.
- **Label** (Medium, 0.8125rem, 0.05em, uppercase): CTAs, navegación, etiquetas funcionales.

**The Weight-Only Rule.** No se usa italic, bold falso, ni subrayado decorativo para crear énfasis. El peso y el tamaño son las únicas herramientas de jerarquía dentro de la familia.

## 4. Elevation

Sistema plano por defecto. La profundidad se comunica con cambios sutiles de fondo y bordes tenues, no con sombras. Las sombras aparecen solo como respuesta a estado (hover, focus) y con moderación.

**The Flat-By-Default Rule.** Las superficies son planas en reposo. Las sombras aparecen solo como respuesta a interacción. Si todo tiene sombra, nada la tiene.

### Shadow Vocabulary
- **[hover-glow]** ([a definir]): Brillo difuso bajo elementos interactivos al pasar el cursor.
- **[focus-ring]** ([a definir]): Anillo de foco sutil, lo mínimo para accesibilidad WCAG.

## 5. Components

*[Sección omitida en modo seed — no existen componentes aún. Se poblará al ejecutar `/impeccable document` en modo scan.]*

## 6. Do's and Don'ts

### Do:
- **Do** usar espacio generoso como elemento de diseño. El vacío es lujo.
- **Do** mantener el acento de marca por debajo del 10% de cualquier superficie.
- **Do** usar fotografía de alta calidad como material narrativo principal.
- **Do** construir jerarquía solo con peso y tamaño tipográfico.
- **Do** cumplir contraste AA como mínimo (4.5:1 cuerpo, 3:1 texto grande).

### Don't:
- **Don't** usar rosa chicle saturado, tipografías script cursivas, ni brillos excesivos. *"Cursi/tacky barato"* — PRODUCT.md.
- **Don't** caer en el minimalismo SaaS estéril: fondos blancos puros, íconos genéricos, paletas azul-gris corporativas.
- **Don't** sobrecargar con ornamentos, dorados excesivos, ni look "palacio versallesco".
- **Don't** usar más de una familia tipográfica. La voz es una sola.
- **Don't** poner sombras en elementos estáticos. Solo en respuesta a interacción.
- **Don't** usar `border-left` o `border-right` > 1px como franja de color decorativa.
- **Don't** aplicar texto con gradiente (`background-clip: text`). Decorativo, nunca significativo.
