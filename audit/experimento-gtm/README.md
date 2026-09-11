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
| `ventana-conversion.mjs` | Barrido de siete instantes de toque (800, 1500, 1800, 2500, 3000, 3500 y 5000 ms) en las tres ramas. |
| `informe-fase2b-experimento-gtm.html` | **El informe completo**, autocontenido: se abre con doble clic y sin conexión. |
| `informe-temporizador-15s-vs-3s.html` | **Informe comparativo** del temporizador: 1,5 s frente a 3 s, ambos con CTA en pestaña nueva. |

## Cómo se corre

```bash
node audit/experimento-gtm/proxy.mjs --variante=actual       --puerto=8798 &
node audit/experimento-gtm/proxy.mjs --variante=defer3s      --puerto=8799 &
node audit/experimento-gtm/proxy.mjs --variante=deferblank   --puerto=8796 &
node audit/experimento-gtm/proxy.mjs --variante=deferblank15 --puerto=8795 &

node audit/experimento-gtm/ventana-conversion.mjs 2
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
- Con CPU 10×, el escenario más cercano a PageSpeed Insights, ganan las tres
  páginas: home 91→99, /sonido 89→95, /pantallas-led 93→98, con el TBT cayendo
  de ~250 ms a menos de 45 ms.
- Riesgo: el diferimiento **solo** pierde la conversión de WhatsApp cuando el
  usuario toca el CTA en los primeros ~3,5 s, porque esos botones navegan en la
  misma pestaña y matan el documento. Medido: 10 fallos de 14 observaciones.
- Mitigación: abrir los CTA de WhatsApp en pestaña nueva, como ya hace el botón
  flotante. Con ella la conversión sale en los cinco instantes probados,
  incluido uno que **hoy ya falla**.

## Segunda ronda: el temporizador

Se midio 1,5 s frente a 3 s manteniendo los CTA en pestana nueva. **1,5 s queda
descartado**: con CPU 10x iguala o empeora el estado actual (TBT 317 ms en
/sonido frente a 298 hoy y 1 con 3 s; /pantallas-led baja de 92 a 88 puntos).
El motivo es que a 1,5 s el contenedor arranca justo despues del primer pintado,
asi que todo su coste cae dentro de la ventana que mide el bloqueo. Lo unico que
mejora es el cookie de atribucion, de 4,2 s a 2,8 s.

En conversiones las tres ramas empatan, 14 de 14, gracias a la pestana nueva.

Detalle en `informe-temporizador-15s-vs-3s.html`.
