# Movimiento: GSAP, Lenis y React Bits (2026-10-31)

Pedido: sumar GSAP, Lenis y React Bits al sitio público y al panel, empezando por el sitio público.

## 1. Criterio

- **GSAP 3.15.0** (licencia estándar sin cargo, incluye plugins y uso comercial). Para entradas, transiciones y números.
- **Lenis 1.3.26** (MIT). Scroll suave **sólo en el sitio público**. En el panel no: tablas con scroll lateral, modales, listas con scroll propio y mucho uso desde el teléfono; ahí el scroll suave se siente pesado y pelea con los scrolls internos.
- **React Bits**: no se instala. Se copian al repo sólo los componentes que se usen, adaptados a los colores y temas de Verdeo, después de revisar su licencia y sus dependencias (varios usan GSAP, Motion o Three.js).
- Siempre:
  - con "reducir movimiento" no hay animaciones ni scroll suave;
  - el estado oculto lo pone el código, nunca el CSS: si el código no carga, la página se ve completa;
  - las librerías se cargan aparte (`import()`), sólo en las pantallas que las usan.

## 2. Fase 1: portada pública ✅

- `apps/web/src/lib/publicMotion.ts`, cargado con `import()` desde la portada (`HomePage` en `routes/App.tsx`) cuando la página ya está dibujada. Ninguna otra pantalla lo baja.
- Lenis con `allowNestedScroll`: el asistente y el menú del teléfono siguen con su scroll propio. En el teléfono el scroll es el nativo (Lenis sólo suaviza la rueda).
- Los enlaces del menú ("/#section-menu" y los demás) deslizan hasta la sección dejando lugar para la barra fija. Quien llega con un ancla desde otra página cae en la sección.
- El primer bloque (la portada con el logo o el texto rotativo) entra al cargar, escalonado.
- Lo demás entra al aparecer en pantalla, por clase: pasos, familias del menú, consejos, ciudades, carrusel, pie de contacto, títulos, preguntas e imágenes. Las secciones que llegan después (menú de la semana, ciudades) se enganchan solas.
- Al salir de la portada se desarma todo (Lenis, disparadores y estilos).
- `html.lenis { scroll-behavior: auto }`: el suavizado del navegador y el de Lenis no se suman.

## 3. Fase 2: panel (pendiente, a definir)

Propuestas, sin Lenis:

- El búho: transición entre sus tres estados y entrada de cada respuesta.
- Estadísticas: números que suben y entrada de los gráficos.
- Entrada suave de paneles y tarjetas del tablero.

Antes de implementar: elegir pantallas y efectos (y, si hay, los componentes de React Bits).
