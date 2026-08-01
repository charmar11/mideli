# Mideli: POS móvil, avisos y borrado de historial

Fecha: 2026-08-01

## Objetivo

Corregir la experiencia del mesero en iPhone/PWA para que el pedido no choque con la navegación, cada producto agregado sea evidente y los avisos de cocina puedan activarse y probarse desde el propio dispositivo. Permitir temporalmente que meseros y supervisores eliminen pedidos del historial.

## Decisiones

### Pedido móvil

- Sustituir el botón flotante circular por una barra compacta anclada sobre la navegación inferior.
- Respetar `env(safe-area-inset-bottom)` y reservar espacio al final del catálogo.
- Mostrar artículos y total en la barra para que el estado del pedido siempre sea visible.

### Confirmación al agregar productos

- Dar un pulso breve a la tarjeta agregada.
- Cambiar temporalmente el icono de suma por una confirmación.
- Mostrar una insignia persistente con la cantidad de ese producto dentro del pedido.
- Aplicar la misma confirmación después de guardar variaciones.

### Audio y Push en iPhone

- Compartir una sola instancia del audio de “pedido listo” entre el control y el observador de pedidos.
- Activar el audio únicamente desde una interacción explícita del usuario.
- Al tocar la campana, activar o comprobar Push y reproducir una prueba del sonido local.
- Mantener Web Push para segundo plano. En iPhone, la PWA debe estar instalada y el sonido de la notificación depende de los ajustes de iOS y de Focus.

### Borrado de historial

- Autorizar en servidor y UI a `owner`, `admin`, `supervisor` y `waiter`.
- Mantener la confirmación destructiva y las protecciones para cobros compartidos.

## Criterios de aceptación

- En 390 x 844 px, la barra del pedido no toca ni cubre la navegación inferior.
- Al agregar un producto sin variaciones se ve pulso, confirmación y cantidad; con variaciones sucede al confirmar.
- La campana permite probar el MP3 real y comunica claramente el estado de Push.
- Un mesero activo puede ver y ejecutar “Eliminar pedido” en Historial.
- `npm run lint` y `npm run build` terminan sin errores.
