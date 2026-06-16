<!-- SEED: next run `/impeccable document` to capture the actual tokens and components. -->

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
- Lo recargado: cero ornamentos excesivos ni estética "palacio versallesco"
  > **Excepción aprobada por el propietario:** dorado suave `#C09537` como acento de marca. Usado con moderación (≤10 % de cualquier superficie), no es "dorado excesivo" — es un acento refinado y contenido.

**Key Characteristics:**
- Paleta contenida: neutros cálidos tintados hacia el acento dorado + acento `#C09537` usado con moderación
- Pairing tipográfico: Cormorant Garamond (serif, display) + system-ui (sans-serif, cuerpo). La jerarquía se construye con peso, tamaño, italic y espacio — no con cambios arbitrarios de familia. La voz serif reserva su presencia para los momentos de máximo impacto.
- Movimiento responsable: transiciones sutiles, revelaciones suaves al scroll, sin coreografía excesiva
- Espacio generoso, ritmo editorial, luz como material de diseño

## 2. Colors

Una paleta **restrained**: neutros cálidos tintados sutilmente hacia el acento dorado, con un solo color de acento usado en ≤10 % de cualquier superficie. La contención es la elegancia.

**The One Voice Rule.** El acento de marca aparece en ≤10 % de cualquier pantalla. Su rareza es el punto. Si empieza a sentirse ubicuo, se diluye.

### Accent

| Token | Valor | Uso |
|---|---|---|
| `--color-accent` | `#C09537` | CTAs principales, enlaces, acentos puntuales |
| `--color-accent-deep` | `oklch(48% 0.09 0)` | Focus rings, estados activos |
| `--color-accent-soft` | `oklch(78% 0.04 10 / 0.25)` | Backgrounds de selección, overlays sutiles |
| `--color-accent-blush` | `oklch(82% 0.035 10 / 0.3)` | Gradientes de calidez en fondos |

### Neutral

| Token | Valor | Uso |
|---|---|---|
| `--color-bg` | `oklch(97% 0.006 0)` | Fondo principal — cálido sin ser crema, blanco roto con matiz mínimo |
| `--color-bg-alt` | `oklch(94% 0.008 0)` | Fondo alterno — un paso más oscuro para secciones que respiran distinto |
| `--color-surface` | `oklch(99% 0.003 0)` | Superficie elevada — cards, placeholders |
| `--color-ink` | `oklch(18% 0.004 0)` | Texto principal — casi negro con personalidad |
| `--color-ink-secondary` | `oklch(42% 0.006 0)` | Texto secundario — gris medio con calidez. Contraste AA sobre fondo principal |
| `--color-ink-muted` | `oklch(60% 0.005 0)` | Texto terciario, metadatos, fechas |
| `--color-border` | `oklch(88% 0.006 0)` | Borde / divisor principal — sutil, presente solo cuando es necesario |
| `--color-border-light` | `oklch(93% 0.007 0)` | Borde ligero para superficies claras |

### Action Bar (testimonios — fondo oscuro)

| Token | Valor | Uso |
|---|---|---|
| `--color-action-bar` | `oklch(96% 0.015 0 / 0.7)` | Fondo de barra de acciones en cards oscuras |
| `--color-action-icon` | `oklch(55% 0.14 0 / 0.78)` | Íconos de acción en cards oscuras |

## 3. Typography

**Pairing tipográfico aprobado por el propietario.**

- **Display (Serif):** Cormorant Garamond — fallback stack: `'Cormorant Garamond', 'Kepler Std', Georgia, 'Times New Roman', serif`
- **Body (Sans-serif):** System UI stack — `system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`

**Character:** Cormorant Garamond aporta calidez editorial y prestigio en los titulares. La sans-serif de sistema mantiene legibilidad y neutralidad en el cuerpo. Dos familias, una sola voz — la serif aparece solo donde su presencia suma autoridad.

### ~~The Weight-Only Rule~~ (DEROGADA)

> **Regla original (derogada):** «No se usa italic, bold falso, ni subrayado decorativo para crear énfasis. El peso y el tamaño son las únicas herramientas de jerarquía dentro de la familia.»
>
> **Derogación aprobada por el propietario:** se adopta un pairing tipográfico de dos familias: Cormorant Garamond (serif) para display + system-ui (sans-serif) para cuerpo. Se permite italic en títulos (h1 usa `font-style: italic` con Cormorant Garamond) como herramienta de jerarquía y personalidad. El cambio de familia es deliberado y controlado: sans-serif es la voz por defecto; la serif entra solo en headlines donde suma prestigio editorial.

### Hierarchy

| Nivel | Familia | Peso | Tamaño | Leading | Notas |
|---|---|---|---|---|---|
| **Display** | Cormorant Garamond | 600 italic | `clamp(2.2rem, 4.5vw, 3.25rem)` | 1.2 | Hero headlines. Pocas palabras, máximo impacto |
| **Headline** | System UI | 600 | `clamp(1.25rem, 3vw, 1.75rem)` | `1.15` | Títulos de sección |
| **Body** | System UI | 400 | `0.9375rem` | `1.5` | Texto de lectura. Max 65–75ch de ancho de línea |
| **Small** | System UI | — | `0.8125rem` | — | Metadatos, navegación secundaria |
| **XS** | System UI | — | `0.75rem` | — | Fechas, contadores, etiquetas funcionales |

## 4. Elevation

### ~~The Flat-By-Default Rule~~ (DEROGADA, con excepción)

> **Regla original (derogada):** «Las superficies son planas en reposo. Las sombras aparecen solo como respuesta a interacción. Si todo tiene sombra, nada la tiene.»
>
> **Derogación aprobada por el propietario:** se mantiene el principio general de planitud, pero se introduce una excepción documentada: `shadow-card` (`0 1px 2px oklch(0% 0 0 / 0.06)`) se aplica a cards en reposo. Es una sombra mínima — solo 2 px de blur, 6 % de opacidad — que aporta definición sin romper la estética limpia. Las sombras más pronunciadas siguen reservadas para interacción (hover, glow activo).

### Shadow Vocabulary

| Token | Valor | Aplicación |
|---|---|---|
| `--shadow-card` | `0 1px 2px oklch(0% 0 0 / 0.06)` | Cards en reposo (excepción aprobada) |
| `--shadow-card-hover` | `0 4px 16px oklch(0% 0 0 / 0.1)` | Cards al hover (placeholder icon, etc.) |
| `--focus-ring` | `outline: 2px solid oklch(48% 0.09 0)` + `outline-offset: 2px` | Foco accesible WCAG |

### Cards oscuras (Testimonials)

Las cards de testimonios usan un sistema de sombras más dramático sobre fondo oscuro (`#171616`):
- **Reposo:** `0 1px 3px rgba(0,0,0,0.3), 0 8px 32px rgba(0,0,0,0.25)` + borde sutil `rgba(255,255,255,0.06)`
- **Glow activo (scroll):** se añade `0 0 40px oklch(78% 0.08 10 / 0.15), 0 0 80px oklch(80% 0.05 10 / 0.08)`
- **Hover:** `0 2px 6px rgba(0,0,0,0.4), 0 12px 40px rgba(0,0,0,0.35)` + glow acentuado

## 5. Spatial System

| Token | Valor | Uso |
|---|---|---|
| `--space-xs` | `0.5rem` | Micro-espaciado: gaps entre ícono y texto |
| `--space-sm` | `0.75rem` | Espaciado pequeño: padding de nav, gaps internos |
| `--space-md` | `1rem` | Espaciado base: padding inline de container, gaps entre bloques |
| `--space-lg` | `1.25rem` | Espaciado medio: separación entre párrafos y CTAs |
| `--space-xl` | `1.5rem` | Espaciado amplio: padding de cards |
| `--space-2xl` | `2rem` | Separación entre secciones pequeñas |
| `--space-3xl` | `2.5rem` | Separación entre grupos de contenido |
| `--space-4xl` | `3.5rem` | Separación entre secciones mayores |
| `--section-gap` | `clamp(2rem, 5vw, 3.5rem)` | Gap vertical responsivo entre secciones |
| `--content-max` | `42rem` | Ancho máximo de línea para legibilidad |

### Radius

| Token | Valor | Uso |
|---|---|---|
| `--radius-sm` | `4px` | Borders pequeños, badges, etiquetas |
| `--radius-md` | `8px` | Cards, imágenes, contenedores |
| `--radius-lg` | `12px` | Cards principales (testimonios) |
| `--radius-full` | `9999px` | Avatars, botones redondos, pills |

## 6. Motion

| Token | Valor | Uso |
|---|---|---|
| `--duration-fast` | `150ms` | Hover states, transiciones de color |
| `--duration-normal` | `250ms` | Transiciones estándar: reveal, fade |
| `--duration-entrance` | `500ms` | Animaciones de entrada: logo reveal, CTA reveal |
| `--ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Curva de easing estándar para todas las transiciones |

**Regla de movimiento reducido:** Todas las animaciones y transiciones se desactivan bajo `prefers-reduced-motion: reduce` (`animation-duration: 0.01ms !important; transition-duration: 0.01ms !important`). El scroll-behavior también revierte a `auto`.

## 7. Components

*[Sección omitida en modo seed — no existen componentes aún. Se poblará al ejecutar `/impeccable document` en modo scan.]*

## 8. Do's and Don'ts

### Do:
- **Do** usar espacio generoso como elemento de diseño. El vacío es lujo.
- **Do** mantener el acento de marca (`#C09537`) por debajo del 10 % de cualquier superficie.
- **Do** usar fotografía de alta calidad como material narrativo principal.
- **Do** construir jerarquía con peso, tamaño, italic y pairing controlado de familias tipográficas.
- **Do** cumplir contraste AA como mínimo (4.5:1 cuerpo, 3:1 texto grande).
- **Do** usar `shadow-card` sutil en cards estáticas (excepción aprobada al Flat-By-Default).
- **Do** usar Cormorant Garamond italic en headlines principales para añadir prestigio editorial.
- **Do** aplicar glow progresivo en las cards de testimoniales al hacer scroll (efecto VSL).

### Don't:
- **Don't** usar rosa chicle saturado, tipografías script cursivas, ni brillos excesivos. *"Cursi/tacky barato"* — PRODUCT.md.
- **Don't** caer en el minimalismo SaaS estéril: fondos blancos puros, íconos genéricos, paletas azul-gris corporativas.
- **Don't** sobrecargar con ornamentos ni dorados excesivos. El dorado `#C09537` es suave y contenido — no es "excesivo". Se usa con moderación (≤10 %).
- ~~**Don't** usar más de una familia tipográfica~~ (DEROGADA). Se usan exactamente dos: Cormorant Garamond (display) + system-ui (body). La voz es una sola; la serif aparece solo donde suma autoridad.
- ~~**Don't** poner sombras en elementos estáticos~~ (DEROGADA, con excepción). `shadow-card` sutil está autorizado en cards en reposo. Sombras más pronunciadas siguen siendo solo para interacción.
- **Don't** usar `border-left` o `border-right` > 1px como franja de color decorativa.
- **Don't** aplicar texto con gradiente (`background-clip: text`). Decorativo, nunca significativo.
