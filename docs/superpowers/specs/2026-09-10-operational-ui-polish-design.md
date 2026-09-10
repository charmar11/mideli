# Pulido operativo de interfaz

Fecha: 2026-09-10

## Objetivo

Mejorar la comodidad de uso de Mideli en móvil y tablet sin cambiar reglas de pedidos, cobros, WhatsApp, inventario o caja. La primera fase se concentra en el marco visual compartido y en las áreas donde el personal trabaja durante el turno.

## Alcance aprobado

1. Mantener la navegación principal y las barras operativas fijas dentro del viewport útil, respetando el área segura del dispositivo.
2. Evitar desplazamiento horizontal accidental en las vistas operativas y conservar el desplazamiento vertical dentro del panel que corresponde.
3. Asegurar targets táctiles mínimos de 44 a 48 px para navegación, acciones, filtros y controles frecuentes.
4. Hacer más visibles los estados seleccionados, activos, cargando, vacío y error usando los tokens visuales existentes de Mideli.
5. Validar primero Mesero, WhatsApp y una vista administrativa en Brave con viewport móvil y tablet.

## Fuera de alcance

- Cambios al esquema de Supabase o a datos existentes.
- Cambios en el bot, plantillas, cálculo de pedidos, cobros o permisos.
- Rediseño completo de cada módulo.
- Nuevas funciones comerciales o multi-restaurante.

## Enfoque técnico

- Revisar el shell del dashboard y los contenedores de scroll antes de tocar pantallas individuales.
- Preferir `min-h-0`, `min-w-0`, `dvh`, `overscroll-contain` y `touch-pan-y` donde corresponda.
- Mantener un solo scroll principal por vista y scroll interno únicamente para listas o conversaciones que lo necesiten.
- Usar componentes y clases existentes, evitando duplicar estilos.
- No ocultar contenido para resolver overflow; el contenido debe reacomodarse o desplazarse dentro de su región.

## Validación

- `npm run lint`
- `npm run build`
- Suite Playwright existente.
- Revisión visual en Brave a 390x844 y 1024x768.
- Confirmar que no hay desplazamiento horizontal del documento, que los botones son alcanzables y que el contenido no queda debajo de barras fijas.

