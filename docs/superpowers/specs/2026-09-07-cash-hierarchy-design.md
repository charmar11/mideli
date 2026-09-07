# Historial jerárquico de gastos y movimientos

## Objetivo

Reorganizar la pestaña `Gastos y movimientos` de `Control → Caja` para que el personal pueda revisar los registros con la misma lógica temporal que usa el negocio: mes, semana y día. La primera versión no distingue entre gastos externos y gastos de caja porque el modelo actual no captura ese origen.

## Alcance aprobado

- La vista inicia en el mes actual.
- El mes muestra totales generales y una tarjeta por semana.
- Cada semana muestra sus días y el total de cada día.
- Cada día muestra los movimientos individuales de ese día.
- La navegación permite regresar de día a semana y de semana a mes.
- Se conservan la búsqueda, los filtros de tipo y estado, y las acciones auditadas de corregir y anular.
- Los importes se agrupan por el importe efectivo corregido, no por el importe original cuando existe una corrección.
- Los movimientos anulados permanecen visibles, pero no afectan los totales.

## Experiencia de usuario

### Vista de mes

El encabezado incluye:

- selector de mes anterior/siguiente;
- buscador por motivo, persona o turno;
- actualización manual;
- tarjetas de resumen para gastos, retiros, fondos agregados y cantidad de movimientos.

Debajo se muestran semanas de lunes a domingo. Una semana puede incluir días del mes anterior o siguiente para conservar el calendario completo, pero sus totales solo consideran los registros que pertenecen al mes seleccionado. Cada tarjeta presenta rango de fechas, cantidad de movimientos, gasto total, retiros y fondos.

### Vista de semana

El encabezado muestra la ruta `Mes → Semana`, el rango de fechas y el total de la semana. Los siete días se muestran como tarjetas, incluidos los días sin movimientos para que el equipo entienda la continuidad del periodo. Cada día muestra cantidad y totales por tipo. Tocar una tarjeta abre la vista del día.

### Vista de día

El encabezado muestra la ruta `Mes → Semana → Día`, el total del día y el número de registros. Los movimientos se muestran en una lista optimizada para tablet y móvil. Cada registro conserva:

- tipo y dirección;
- motivo;
- importe original y efectivo;
- turno;
- persona que lo registró y autorizador;
- fecha y hora;
- motivo de corrección, cuando aplique;
- acciones `Corregir importe` y `Anular movimiento` cuando siga activo.

## Datos y arquitectura

No se crea una tabla nueva ni se modifica el modelo contable. La interfaz reutiliza `list_cash_movements` y agrupa los movimientos ya autorizados en el cliente usando la zona horaria operativa de Mideli, `America/Hermosillo`.

El primer nivel solicita el conjunto de movimientos disponible para el historial y aplica los filtros antes de agrupar. Las funciones de agrupación serán puras y separadas de la presentación para poder migrar más adelante a agregaciones SQL sin cambiar la navegación.

La semana se calcula de lunes a domingo. Los límites de mes, semana y día se interpretan en la zona horaria del local y se convierten a rangos ISO únicamente al consultar. Las fechas se muestran en español de México.

## Estados vacíos y errores

- Mes sin movimientos: mostrar el mes, sus semanas y un estado vacío amable.
- Semana sin movimientos: mostrar los siete días con cero y una indicación para elegir un día con registros.
- Día sin movimientos: informar que no hay gastos o movimientos registrados.
- Error de consulta: conservar el nivel de navegación actual y ofrecer reintentar.
- Si una corrección se guarda, regresar al mismo día y actualizar sus totales.

## Responsive y accesibilidad

- Controles táctiles mínimos de 44 a 48 px.
- En móvil, las tarjetas ocupan el ancho disponible y el detalle del día usa una lista vertical.
- En tablet, los días se organizan en una cuadrícula legible, sin scroll horizontal.
- La ruta de navegación y el botón de regreso permanecen visibles.
- Los colores distinguen gasto, retiro, entrada, corrección y anulación sin depender únicamente del color: siempre llevan texto o icono.
- Los controles de corrección mantienen sus diálogos actuales y su autorización por PIN.

## Alternativas consideradas

1. **Agrupar en cliente con el RPC existente, opción elegida.** Tiene el menor riesgo, no cambia Supabase y es suficiente para el piloto.
2. **Crear RPCs de agregación mensual, semanal y diaria.** Será una optimización posterior si el volumen de movimientos vuelve lenta la carga.
3. **Crear un módulo contable separado.** Se descarta por ahora porque duplicaría movimientos y ampliaría el alcance sin resolver una necesidad actual.

## Verificación

- Probar navegación mes → semana → día y regreso.
- Probar cambios de mes, semanas que cruzan meses y días sin registros.
- Verificar que correcciones y anulaciones recalculen el nivel actual.
- Ejecutar `npm run lint` y `npm run build`.
- Ejecutar la suite E2E existente y añadir pruebas de las agrupaciones si la infraestructura actual lo permite.
