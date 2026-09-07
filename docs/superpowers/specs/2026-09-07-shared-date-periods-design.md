# Diseño: selector común de periodos y fechas

## Objetivo

Unificar el manejo de fechas de las vistas administrativas y de seguimiento de Mideli para que todas usen la fecha actual del local, `America/Hermosillo`, sin desplazamientos entre dispositivos.

## Alcance

- Compartir tipos y operaciones para día, semana, mes y año.
- Reutilizar un selector visual con navegación anterior/siguiente, escala activa y regreso a hoy.
- Mantener la interfaz en español y con controles táctiles de al menos 44 px.
- Aplicar el selector a Analíticas, Historial de ventas y Caja/cortes.
- Mantener Gastos y movimientos con su navegación mes → semana → día, pero sobre la misma lógica de fechas.
- No introducir selectores de periodo en modales operativos de cobro, mesa o edición de pedidos.

## Arquitectura

La lógica neutral vivirá en un módulo compartido de periodos. Analíticas conservará su integración con la URL mediante un adaptador pequeño. El componente visual recibirá el periodo actual y un callback `onChange`, por lo que no dependerá de router, Supabase ni de una vista concreta.

Los valores de fecha serán claves `YYYY-MM-DD` calculadas con calendario UTC y formateadas para `America/Hermosillo`. El día actual se obtendrá con `Intl.DateTimeFormat` usando esa zona. Las vistas no permitirán navegar hacia fechas futuras.

## Comportamiento

- Las vistas de consulta comienzan en el día actual.
- Cambiar de escala vuelve a anclar en el día actual para evitar conservar un periodo histórico accidental.
- Abrir el selector vuelve a posicionarlo en el periodo actual de la escala seleccionada.
- La navegación anterior/siguiente conserva la escala y limita el siguiente periodo al día actual.
- Ventas y cortes filtran sus datos por `from` y `to` del periodo seleccionado.
- Gastos mantiene el detalle jerárquico existente y reutiliza las funciones de límites, etiquetas y zona horaria.

## Estados y errores

El componente no realiza peticiones. Si una vista no puede cargar sus datos, conserva el periodo visible y muestra el error de la vista con opción de reintento. Un cambio de periodo no debe borrar filtros independientes como búsqueda, estado o responsable.

## Verificación

- Pruebas unitarias/E2E para fecha actual, cambio de escala, navegación y límites.
- Verificación específica con la fecha del navegador en otra zona horaria.
- `npm run lint` y `npm run build` obligatorios.
- Prueba E2E existente de Analíticas y Gastos debe continuar pasando.
