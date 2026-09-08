# 4Pi Ads Dashboard

Dashboard standalone (HTML/CSS/JS puro, sin build ni dependencias) para analizar anuncios de
Meta Ads con el **método 4Pi de Charley Tichenor** ("The NEW BEST Way to Analyze Facebook Ads").

Vive separado del resto del repo a propósito — es un prototipo para eventualmente integrar a
"oboi", pero por ahora es una carpeta independiente que no modifica nada de las clases del curso.

## Cómo usarlo

Abrí `index.html` en el navegador (o serví la carpeta con cualquier static server, ej.
`npx serve 4pi-ads-dashboard`). No requiere backend: todo se guarda en `localStorage` del
navegador.

1. Configurá el nombre de cuenta, el período y la etiqueta del resultado que estés optimizando
   (Compra, Lead, etc.).
2. Cargá anuncios a mano con el botón **"+ Agregar anuncio"**, o importá un CSV exportado desde
   Meta Ads Manager (columnas típicas: nombre del anuncio, importe gastado, frecuencia, CPM,
   costo por resultado).
3. Para cada anuncio asigná un **rol de funnel** (Prospección / Medio / Cierre — mismo criterio
   que TOFU/MOFU/BOFU) porque el método necesita saber el rol del anuncio para leer bien sus
   métricas.
4. El dashboard calcula el **promedio de la cuenta** para Spend, Frecuencia, CPM y Cost/Result
   en el período cargado, clasifica cada anuncio arriba/abajo de ese promedio en las 4 métricas,
   y le asigna un diagnóstico automático basado en los patrones del método:
   - ✅ Prospección sana
   - ✅ Cierre sano
   - 🚩 Caro, pero todavía querido
   - 🚩 Atrayendo la atención equivocada
   - 🚩 Tibio, pero no convierte
   - ⚪ Sin patrón claro (mezcla de señales, revisar caso a caso)
5. Cada anuncio tiene un log de cambios (presupuesto/puja/audiencia) para poder distinguir,
   cuando la frecuencia es baja, si es porque el anuncio sigue prospectando sano o porque vos
   estás reseteando la campaña todo el tiempo (ver sección 3 de la spec).

## Qué es y qué no es

- Las comparaciones son siempre **contra el promedio de la propia cuenta/período**, nunca contra
  un umbral fijo — así lo explica Charley T en el video, así que no hay números "mágicos"
  hardcodeados.
- Los patrones son heurísticas basadas en las 4 señales del método (Spend, Frequency, CPM,
  Cost/Result). El video no da límites numéricos exactos para cada patrón, así que algunos casos
  van a caer en "Sin patrón claro" — es esperado, está pensado como punto de partida para mirar
  el anuncio con más detalle, no como un veredicto automático.
- No se conecta todavía a la API de Meta ni a oboi. Es carga manual o por CSV. La integración
  real (traer datos en vivo, cruzar con el árbol de decisiones de Caro Dubi) queda para una
  siguiente etapa.

## Estructura

```
4pi-ads-dashboard/
├── index.html   → estructura de la página (config, tabla, modales)
├── styles.css   → estilos, independientes del resto del sitio
├── rules.js     → el motor de reglas del método 4Pi (promedios + clasificación + patrones)
└── main.js      → estado, persistencia en localStorage, render y eventos de la UI
```
