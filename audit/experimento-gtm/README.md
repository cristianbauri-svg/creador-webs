# Experimento de diferimiento de Google Tag Manager (Fase 2B)

**Nada de esto está en producción.** Los archivos viven en `audit/` a propósito:
fuera de `public/` y de `src/`, para que ningún `wrangler deploy` accidental
pueda publicarlos.

## Qué hay aquí

| Archivo | Para qué |
|---|---|
| `snippet-defer.min.html` | El fragmento que se desplegaría. Forma compacta, sintaxis validada. |
| `snippet-defer.html` | El mismo fragmento comentado en detalle, para leerlo. **No desplegar**: sus comentarios añaden ~480 bytes comprimidos y eso cruza la ventana inicial de congestión TCP, lo que cuesta ~150 ms de FCP. |
| `proxy.mjs` | Banco de pruebas. Sirve producción real reescribiendo solo el fragmento de GTM. Variantes: `actual`, `defer3s`, `deferload`, `deferblank`. |
| `pruebas-conversion.mjs` | Batería de conversión: cola de eventos, interacción, clic tardío y formulario. |
| `prueba-gclid.mjs` | Cuándo se escribe el cookie de atribución `_gcl_aw` en cada rama. |

## Cómo se corre

```bash
node audit/experimento-gtm/proxy.mjs --variante=actual    --puerto=8798 &
node audit/experimento-gtm/proxy.mjs --variante=defer3s   --puerto=8799 &
node audit/experimento-gtm/proxy.mjs --variante=deferblank --puerto=8796 &

node audit/experimento-gtm/pruebas-conversion.mjs http://127.0.0.1:8798 "ACTUAL"
node audit/experimento-gtm/pruebas-conversion.mjs http://127.0.0.1:8799 "DEFER"
node audit/experimento-gtm/prueba-gclid.mjs       http://127.0.0.1:8799 "DEFER"
```

Las navegaciones a WhatsApp se responden con una página de relleno y los `POST`
a `/api/quotations` se interceptan: las pruebas no abren chats ni crean
cotizaciones reales.

## Conclusión medida

- Ganancia: `/sonido` pasa de 92 a 97 en móvil con GTM fuera de la ventana de
  carga (LCP −874 ms, TBT a cero en las tres páginas).
- Riesgo: el diferimiento **solo** pierde la conversión de WhatsApp cuando el
  usuario toca el CTA entre ~1,5 y ~3,3 s, porque esos botones navegan en la
  misma pestaña y matan el documento. Medido 4 de 4.
- Mitigación: abrir los CTA de WhatsApp en pestaña nueva, como ya hace el botón
  flotante. Con ella la conversión sale en los cinco instantes probados,
  incluido uno que **hoy ya falla**.
