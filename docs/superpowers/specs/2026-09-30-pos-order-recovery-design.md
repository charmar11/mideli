# Recuperación segura de pedidos POS tras cerrar la app

**Fecha:** 2026-09-30
**Estado:** Diseño aprobado e implementado; producción `READY` en `dpl_7sfNkHrETwaCvzPCXi694GxUiiGD` el 2026-09-30. Salud `/api/health`: `ok`.

## Problema

El POS ya crea en una sola transacción el pedido y sus datos de domicilio u horario en el flujo multinegocio. La protección contra doble envío usa una clave de creación, pero hoy vive sólo en memoria. Si se cierra la app después de enviar y antes de recibir respuesta, el borrador vuelve sin esa clave y un reintento puede generar un pedido duplicado.

## Resultado esperado

Al volver a abrir Mesero, el sistema debe comprobar si el último intento quedó registrado. Si existe, el pedido debe aparecer en Estado/Historial y el borrador antiguo debe desaparecer, sin mensaje de éxito adicional. Si todavía no existe, el borrador conserva la misma clave y un reintento usa esa clave para no duplicar.

## Diseño

- Añadir al borrador local por usuario sólo un UUID aleatorio del intento pendiente. No guardar teléfono, dirección, colonia ni otros datos del cliente. Mantener compatibilidad con los borradores existentes para no perder comandas al actualizar.
- Antes de llamar a la base al enviar, persistir el UUID junto al borrador. Reutilizarlo para cada reintento ambiguo; limpiarlo sólo cuando el intento se recupere o se confirme guardado.
- Al iniciar Mesero con un UUID pendiente, consultar el resultado con el cliente autenticado y las políticas normales de acceso. La clave por sí sola no concede acceso. Para una comanda mixta, recuperar el lote y sus pedidos; para un pedido normal, recuperar el pedido.
- Si se encuentra, actualizar la lista de pedidos y limpiar el borrador sin mostrar toast. Si no se encuentra, conservarlo para reintentar con la misma clave. Si la consulta falla, conservarlo y no crear una clave nueva ni mandar otro intento; permitir volver a comprobar.
- Mantener los permisos y el aislamiento por organización/negocio. No usar el cliente `service_role` para esta consulta. No modificar pedidos, clientes, ventas ni datos reales durante las pruebas.

## Alcance y límites

Se cubre el pedido manual de Mesero: comedor, para llevar, domicilio y comedor mixto entre negocios. Los datos de domicilio no forman parte del borrador actual; si al volver no hay pedido guardado, la persona deberá completar de nuevo esos datos, igual que hoy. La recuperación de pedidos de WhatsApp no cambia.

No se cambiará la caja, numeración de folios, lógica de cobro, catálogo ni políticas de licencia. Se intentará resolver la búsqueda con tablas, permisos y claves existentes; si la autorización actual no permite una lectura segura, se detendrá el cambio para diseñar una migración antes de tocar producción.

## Verificación y publicación

1. Pruebas del borrador: conserva la clave al recargar, la separa por usuario, acepta datos antiguos y nunca persiste teléfono/domicilio.
2. Pruebas de pedido: recupera un pedido normal y un lote mixto sin crear otro; conserva clave y borrador cuando no hay resultado; conserva ambos si la consulta falla.
3. Pruebas de autorización: un usuario no puede descubrir pedidos de negocios fuera de sus permisos.
4. Ejecutar las pruebas dirigidas, `npm run lint`, `npm run build` y el gate SQL aislado de GitHub. Hacer deploy de producción sólo después de que pasen y comprobar `/api/health`.

## Criterio de aceptación

Después de cerrar Mesero durante un envío y volver a abrirlo, nunca se genera automáticamente una clave nueva para ese intento. Si la base ya guardó el pedido, se recupera sin mensaje y sin duplicarlo; si no lo guardó o no puede comprobarse, el borrador se conserva y no se envía otro pedido con una clave distinta.

La verificación automatizada no generó pedidos en producción; la primera recuperación con un pedido real se observará durante el uso normal.
