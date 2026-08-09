# Control del dueño, limpieza de caja y navegación administrativa

Fecha: 2026-08-09

Estado: aprobado para implementación

## Objetivo

Simplificar el control diario del dueño y corregir tres problemas operativos: una disponibilidad manual de productos que no corresponde al negocio, cortes archivados que contaminan los indicadores de caja y pantallas administrativas de las que es difícil regresar.

Esta decisión reemplaza la sección de disponibilidad del diseño anterior `2026-08-09-owner-daily-control-and-menu-availability-design.md`.

## 1. Inventario sin disponibilidad manual

Se elimina por completo la clasificación `Disponible`, `Limitado` y `Agotado` de Menú, Cocina y POS. También se retiran sus controles, bloqueos, reservas, auditoría y campos de base de datos mediante una migración compensatoria.

El catálogo vuelve a depender únicamente de `is_active`. El inventario se descuenta por las recetas configuradas y puede quedar en negativo. Un faltante se muestra como una señal de inventario para corregir compras o recetas, pero no bloquea automáticamente una venta.

## 2. Correo del resumen del dueño

La configuración conserva un solo destinatario reemplazable. El dueño puede escribir cualquier correo válido y guardarlo. El guardado debe devolver y mostrar el valor realmente persistido, evitando confirmaciones falsas por restricciones de acceso.

El envío de prueba explicará con lenguaje claro cuando el proveedor de correo requiera verificar el remitente antes de entregar a direcciones distintas a la cuenta de prueba. La aplicación no fijará ningún correo en el código.

## 3. Control del dueño

Los indicadores de caja usarán únicamente cortes cerrados no archivados. Los cortes archivados se contabilizarán por separado y se identificarán como excluidos, para que una prueba o un corte inválido no altere la diferencia de caja vigente.

La interfaz mantendrá la identidad oscura de Mideli y ordenará la información así:

1. Alertas que requieren una acción.
2. Indicadores operativos compactos de caja, cocina, inventario y recetas.
3. Rentabilidad y productos sin movimiento.
4. Configuración del resumen por correo.

Rojo se reserva para riesgo o eliminación irreversible, naranja para atención, verde para acciones completadas y dorado para valores monetarios.

## 4. Eliminación definitiva de cortes

La eliminación definitiva solo estará disponible para owner y admin sobre cortes cerrados que ya estén archivados.

Antes de eliminar, el servidor contará relaciones con pedidos, pagos, movimientos, ajustes y traspasos. El corte solo se podrá borrar si todos los conteos son cero. Si contiene operación real, seguirá archivado y la interfaz explicará por qué no puede eliminarse, protegiendo el historial de ventas y cobros.

La confirmación exige:

- Motivo obligatorio.
- Escribir exactamente `ELIMINAR DEFINITIVAMENTE`.
- Una segunda confirmación visual en rojo.

Se conservará únicamente una constancia técnica en el esquema privado con el identificador, folio, valores del corte, motivo, usuario y fecha. Esta constancia no participa en métricas ni aparece como corte recuperable.

## 5. Regreso desde administración

Impresión, Diagnóstico, Caja y las pantallas administrativas sin navegación propia tendrán un control visible `Volver al panel`. Será un enlace estable al panel principal, con área táctil mínima de 44 px y sin depender del historial del navegador.

No se duplicará el control en pantallas que ya tengan una salida clara.

## Seguridad y base de datos

- No se modifican migraciones aplicadas; se crea una migración nueva.
- Las funciones de eliminación validan el rol y la sesión en servidor.
- La tabla de constancias vive en `private`, con RLS habilitado y sin acceso directo del cliente.
- La eliminación se ejecuta en una sola transacción y bloquea la fila del corte.
- Los cortes existentes no se borran automáticamente.

## Verificación

- Confirmar que no queden textos, tipos, controles o columnas de disponibilidad.
- Confirmar que el inventario acepta existencias negativas.
- Confirmar que los indicadores excluyen cortes archivados.
- Probar guardado del destinatario y mensaje de limitación del proveedor.
- Probar eliminación de un corte temporal vacío y rechazo de un corte con relaciones, siempre dentro de una transacción revertida.
- Revisar las pantallas administrativas en móvil y tablet.
- Ejecutar `npm run lint`, `npm run build`, detección visual de Impeccable, dry-run y aplicación de la migración.
