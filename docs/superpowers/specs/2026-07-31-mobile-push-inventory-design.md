# Mideli: POS móvil, avisos PWA e inventario operativo

## Objetivo

Entregar una experiencia operativa simple para teléfono y tableta que permita al personal de Mideli trabajar con rapidez, recibir avisos confiables cuando cocina termine un pedido y conocer el inventario real con trazabilidad suficiente para detectar faltantes, mermas y compras innecesarias.

## Usuarios y permisos

- Mesero: usa Pedido, Estado e Historial; recibe avisos de sus pedidos listos; solo consulta disponibilidad de insumos.
- Cocina: registra conteos, recepciones y mermas, además de operar el KDS.
- Supervisor: registra operaciones de inventario y usa POS y cocina.
- Dueño y administrador: acceso completo, configuración de insumos, recetas, compras y análisis.
- Toda modificación de inventario conserva usuario, fecha, cantidad anterior, cantidad nueva y motivo.

## POS móvil

La navegación local de Mesero se convierte en un selector compacto de tres segmentos. En teléfono usa las etiquetas Pedido, Estado e Historial; en pantallas mayores conserva Nuevo pedido. Cada opción mantiene un área táctil mínima de 44 px, iconos consistentes y un indicador visible para pedidos listos. La barra no se parte, no provoca desplazamiento horizontal y ocupa menos altura que la actual.

## Notificaciones PWA

Mideli incorpora Web Push estándar sobre el service worker de Serwist.

1. El usuario instala la PWA y activa avisos mediante una acción explícita.
2. El navegador crea una suscripción Web Push asociada al usuario y dispositivo.
3. La suscripción se guarda en Supabase con RLS, nombre de dispositivo, fecha de uso y estado activo.
4. Cuando un pedido cambia a `ready`, el servidor envía un aviso a los dispositivos activos del usuario que creó el pedido.
5. Al tocar el aviso, Mideli abre Mesero en Estado y enfoca el pedido correspondiente.
6. Si la aplicación está abierta, permanecen el sonido y el aviso visual en tiempo real. Web Push cubre la aplicación cerrada o en segundo plano.

Las claves VAPID privadas solo viven en secretos de servidor. Las suscripciones vencidas se desactivan automáticamente. Si un dispositivo no soporta Push, la interfaz explica que seguirá usando avisos dentro de la aplicación.

## Inventario operativo

### Navegación

La pantalla principal usa cinco destinos compactos:

1. Hoy: alertas y tareas prioritarias.
2. Contar: conteo físico rápido.
3. Comprar: lista sugerida y pedidos de compra.
4. Recibir: entrada de mercancía y caducidad.
5. Más: mermas, movimientos, insumos y recetas.

En móvil cada flujo utiliza tarjetas y formularios verticales. Las tablas anchas solo aparecen en escritorio.

### Hoy

Muestra únicamente información accionable:

- insumos agotados o debajo del mínimo;
- productos próximos a caducar;
- conteos vencidos;
- compras por recibir;
- diferencias sin conciliar;
- valor actual y costo de merma del periodo como información secundaria para administradores.

Cada alerta lleva directamente a la acción necesaria.

### Conteo

El usuario inicia un conteo completo o solo de críticos. Los insumos aparecen uno por uno con nombre, unidad, ubicación y un campo numérico grande. Se puede guardar borrador y continuar. Al finalizar se compara cantidad esperada contra cantidad física. Toda diferencia requiere elegir un motivo y, si es material, queda pendiente de revisión de dueño o administrador.

### Compras y recepción

Cada insumo tiene mínimo, existencia ideal, proveedor preferido y ubicación. Cuando la existencia alcanza el mínimo, Mideli propone comprar `existencia ideal menos existencia actual`. El responsable puede ajustar la cantidad y marcar la lista como pedida.

Al recibir, se confirma cantidad real, costo unitario, fecha de caducidad opcional, ubicación y observación. Mideli registra quién recibió y concilia diferencias contra lo pedido. La existencia aumenta en una operación atómica.

### Mermas y discrepancias

El flujo rápido permite registrar merma por caducidad, preparación, producto dañado, consumo interno, devolución o pérdida no explicada. Cantidad y motivo son obligatorios. Las diferencias de conteo y pérdidas no explicadas aparecen en el resumen de revisión sin acusar automáticamente a una persona.

### Recetas y consumo automático

Se conserva el descuento automático al agregar artículos a un pedido y la devolución al cancelar. Las recetas siguen siendo editables por administradores. La nueva interfaz separa esta configuración de las tareas diarias para reducir errores.

## Modelo de datos

- `inventory_items`: agrega existencia ideal, proveedor, ubicación, días entre conteos y seguimiento de caducidad.
- `inventory_counts` e `inventory_count_lines`: sesiones, borradores, cantidades esperadas, físicas, diferencias y conciliación.
- `inventory_purchase_orders` e `inventory_purchase_order_lines`: lista sugerida, pedido y estado de recepción.
- `inventory_receipts` e `inventory_receipt_lines`: recepción real, costos, caducidad y responsable.
- `inventory_lots`: cantidades recibidas por lote y fecha de caducidad.
- `inventory_movements`: amplía motivos operativos y conserva el historial inmutable.
- `push_subscriptions`: suscripciones por usuario y dispositivo, protegidas por RLS.

Las operaciones que cambian existencias se ejecutan mediante funciones transaccionales de PostgreSQL para evitar que dos dispositivos sobrescriban cantidades al mismo tiempo.

## Procedimientos integrados

- Inicio de turno: revisar agotados, críticos y caducidades.
- Diario: contar insumos críticos y de alto valor.
- Semanal: conteo completo y conciliación de diferencias.
- Al recibir: comparar pedido, contar, capturar costo y caducidad, almacenar y confirmar.
- Al detectar merma: registrarla en el momento, no al cierre del día.
- Semanalmente: revisar diferencias, merma, compras y valor inmovilizado.

La interfaz presenta estas rutinas como tareas cortas, no como un manual separado.

## Estados y errores

- Carga: esqueletos compactos que preservan el diseño.
- Sin datos: siguiente acción clara, por ejemplo Crear primer insumo.
- Sin conexión: conservar borradores locales de formularios y bloquear confirmaciones que requieran servidor.
- Conflicto de inventario: recargar existencia y pedir confirmación antes de reintentar.
- Permiso denegado: explicar quién puede completar la acción.
- Push no disponible o rechazado: mantener alertas internas y mostrar instrucciones de activación.

## Validación

- ESLint y build de Next.js sin errores.
- Pruebas manuales en anchos de teléfono, tableta y escritorio.
- Prueba de suscripción, envío, recepción y apertura de una notificación.
- Verificación SQL de RLS, funciones transaccionales y movimientos resultantes.
- Prueba de roles para mesero, cocina, supervisor y administrador.
- Detector visual de Impeccable sobre las superficies modificadas.

## Fuera de alcance

- Múltiples sucursales.
- Escáner de código de barras.
- Facturación de proveedores.
- Predicción avanzada con inteligencia artificial.
- Contabilidad formal o integración con un ERP.
