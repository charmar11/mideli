# Rediseño de Analíticas de Mideli

## Objetivo

Convertir Analíticas en un tablero para el dueño del restaurante. Debe permitir entender en pocos segundos cuánto se cobró, cuánto sigue pendiente, qué productos funcionan y cuándo se concentra la demanda.

## Principios

- La venta principal se calcula con órdenes pagadas, usando `paid_at` como fecha contable.
- Las cuentas abiertas se muestran por separado y nunca se presentan como ingreso.
- El periodo anterior se compara automáticamente con el periodo elegido.
- Toda cifra debe explicar qué significa y permitir llegar a una decisión.
- La interfaz mantiene el tema oscuro de Mideli y prioriza tablet y móvil.

## Arquitectura del tablero

1. Encabezado compacto con estado del periodo, exportación CSV y selector temporal.
2. Bloque principal de venta cobrada con comparación contra el periodo anterior.
3. Indicadores secundarios: pedidos pagados, ticket promedio, pendiente por cobrar y cancelaciones.
4. Tendencia temporal con alternancia entre ventas y pedidos.
5. Resumen accionable con hora pico, producto líder y alertas del periodo.
6. Desgloses por producto, categoría, tipo de servicio y método de pago.

## Selector temporal

El selector toma como referencia la interacción entregada por el usuario:

- Modos Día, Semana, Mes y Año.
- Flechas para avanzar o retroceder un periodo completo.
- Etiqueta central con el periodo actual y acceso al panel de selección.
- Calendario mensual para Día y Semana.
- Selección visual de la semana completa.
- Cuadrícula de meses para Mes y cuadrícula de años para Año.
- Fechas futuras deshabilitadas.
- Acción rápida para volver a hoy, esta semana, este mes o este año.
- Aplicación explícita para evitar recargas mientras se está eligiendo.
- Panel centrado y táctil en móvil, popover alineado al control en escritorio.

## Datos y filtros

- Filtro global por comedor, domicilio y para llevar.
- Venta cobrada: órdenes con estado `paid` dentro de `paid_at`.
- Pendiente: órdenes activas no pagadas, mostrado como dato operativo actual.
- Cancelaciones: órdenes canceladas dentro de `cancelled_at` o `created_at` como respaldo.
- Productos y categorías derivados únicamente de órdenes válidas del periodo.
- Métodos de pago calculados únicamente sobre órdenes pagadas.
- Exportación CSV del resumen y los pedidos del periodo.

## Estados

- Carga: estructura de esqueletos que conserva el diseño.
- Sin datos: explica que no hubo ventas cobradas y conserva los datos operativos útiles.
- Error: mensaje claro con opción para reintentar.
- Periodo futuro: imposible de seleccionar.
- Periodo parcial: se identifica como periodo en curso.

## Rendimiento

- Una consulta principal de órdenes con sus artículos y relaciones necesarias.
- Comparación del periodo obtenida en paralelo.
- Cálculos agrupados en el servidor.
- Gráficas cargadas de forma diferida para reducir el JavaScript inicial.
- Actualización de URL solamente al confirmar el periodo.

## Criterios de aceptación

- El dueño distingue dinero cobrado y dinero pendiente sin ambigüedad.
- El selector se usa cómodamente con el dedo en una tablet.
- No se permiten días futuros.
- Día, semana, mes y año tienen una selección apropiada para cada escala.
- Todos los bloques funcionan en escritorio, tablet y móvil sin desbordamiento.
- Lint y build terminan sin errores.
