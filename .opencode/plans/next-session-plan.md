# Mideli: plan para la siguiente sesión

Fecha de preparación: 2026-08-08
Base de trabajo: `v0.9-piloto`
Producción: https://mideli.vercel.app

## Objetivo

Convertir el piloto actual en un servicio mensual confiable para un restaurante pequeño. La siguiente sesión no debe comenzar agregando módulos comerciales. Primero debe reducir el riesgo de que el local se detenga, pierda datos o descubra un error durante el servicio.

## Orden obligatorio

### Fase 1: validar el piloto real

1. Ejecutar el checklist de `docs/releases/v0.9-piloto.md`.
2. Probar con los roles owner, admin, waiter, supervisor y kitchen.
3. Completar un ciclo real: abrir caja, pedir, preparar, entregar, cobrar, corregir pago y cerrar caja.
4. Probar pago completo, combinado, dividido, parcial, descuento autorizado y cuenta pendiente.
5. Probar impresión automática y reimpresión en la laptop e impresora de 48 mm definitivas.
6. Probar PWA, sonido, push y pausa de notificaciones en dispositivos reales.
7. Registrar cualquier fallo con dispositivo, rol, hora, pasos y captura.

Resultado esperado: una lista corta y reproducible de defectos reales, no mejoras basadas solamente en percepción.

### Fase 2: observabilidad, respaldos y recuperación

1. Incorporar monitoreo de errores de cliente y servidor sin capturar datos sensibles.
2. Agregar una comprobación externa de disponibilidad del sitio y alertas al responsable.
3. Confirmar la política de respaldos del plan actual de Supabase.
4. Documentar y ensayar una restauración en un entorno seguro antes de prometer recuperación.
5. Crear un panel técnico mínimo para conocer versión desplegada, conectividad de Supabase, Realtime, impresión y notificaciones.
6. Agregar pruebas automáticas de humo para login, creación de pedido, transición de cocina y cobro.

Resultado esperado: detectar fallos antes que el dueño y poder demostrar cómo se recuperan los datos.

### Fase 3: contingencia sin internet

Antes de programar, diseñar y aprobar el alcance. No debe permitirse que dos dispositivos creen folios o cobros incompatibles.

Alcance inicial recomendado:

- Mantener visible el catálogo y el pedido en curso si se pierde conexión.
- Mostrar un estado de conexión claro y no ambiguo.
- Permitir guardar pedidos pendientes localmente con una clave idempotente.
- Sincronizar pedidos en orden al recuperar conexión.
- No confirmar cobros, correcciones ni cierres de caja que el servidor no pueda validar.
- Informar al operador qué acciones siguen disponibles y cuáles requieren conexión.

Resultado esperado: el mesero puede conservar y enviar pedidos sin duplicarlos; las operaciones financieras siguen protegidas por el servidor.

### Fase 4: resumen diario del dueño

Crear un reporte automático y consultable con:

- Ventas totales y por método de pago.
- Diferencia de caja y movimientos del turno.
- Pedidos cancelados, descuentos y correcciones de pago.
- Productos más vendidos y productos sin movimiento.
- Insumos bajos, compras, conteos y mermas.
- Tiempo promedio de cocina y pedidos demorados.
- Cuentas pendientes de cobro.

La primera versión debe enviarse por correo usando la infraestructura existente. WhatsApp se considera después de medir costo y confiabilidad.

Resultado esperado: el dueño recibe valor visible aunque no abra el panel.

### Fase 5: control de disponibilidad y rentabilidad

1. Permitir marcar productos agotados temporalmente desde POS o cocina.
2. Relacionar disponibilidad con insumos críticos cuando las recetas estén completas.
3. Mostrar costo estimado, margen y cambios de costo por producto.
4. Comparar inventario teórico contra conteo real para detectar merma o captura incorrecta.

Resultado esperado: evitar ventas imposibles y convertir inventario en decisiones de compra y precio.

### Fase 6: crecimiento, solo después del piloto estable

Orden recomendado:

1. Clientes y recibos digitales.
2. Lealtad y promociones.
3. Pedidos directos para recoger o domicilio.
4. Facturación CFDI como módulo adicional.

No priorizar todavía multisucursal, nómina completa, reservaciones avanzadas ni integraciones masivas de delivery.

## Empaquetado comercial recomendado

- Configuración inicial: entre $3,500 y $5,000 MXN.
- Precio fundador durante piloto: $1,190 MXN mensuales.
- Precio normal al estabilizar: $1,490 MXN mensuales.
- Pago anual sugerido: $15,200 MXN.
- Desarrollo personalizado, hardware, consumibles y visitas se cotizan aparte.

La mensualidad debe cubrir licencia, alojamiento, respaldos, actualizaciones, corrección de errores, soporte remoto y capacitación básica. No debe prometer desarrollo personalizado ilimitado.

## Regla para comenzar

En la próxima sesión, leer `AGENTS.md`, `.opencode/plans/mideli-context.md`, este archivo y `docs/releases/v0.9-piloto.md`. Revisar `git status`, confirmar que la rama parte de la etiqueta `v0.9-piloto` y trabajar primero en la Fase 1.
