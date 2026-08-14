# Hallazgos: Push, Cocina y caja

## Línea base

- `push_subscriptions` usa un único `is_active` por endpoint.
- El cliente usa una única clave `mideli.device-alerts-enabled`.
- `getPushStatus` convierte un error remoto en estado `enabled`.
- La pausa no confirma que el endpoint haya sido actualizado.
- Solo Mesero renderiza `PushNotificationControl`.
- `send-order-ready` solo cubre la transición a listo.
- El service worker muestra todos los Push aunque la vista responsable esté visible.
- Cocina tiene sonido local, pero el estado inicial puede no corresponder al permiso real de reproducción.
- `activeOrdersRequest` puede conservar para siempre una consulta sin resolver.
- Los errores de carga borran pedidos ya visibles.
- Realtime reconecta cada 1.5 s sin backoff progresivo.
- `cash_shifts.opening_float` existe y el cálculo remoto ya lo usa.
- El modal de cierre no muestra el fondo inicial ni la fórmula.

## Estado remoto verificado antes del diseño

- La función `send-order-ready` está activa con verificación JWT.
- Las claves Web Push de servidor existen y la pública coincide con el cliente.
- `orders` y `order_items` están publicados en Realtime.
- Existen suscripciones activas de propietario y supervisor.
- El turno abierto más reciente conserva un fondo inicial.

## Restricciones

- No exponer claves o valores de `.env.local`.
- No hacer reset remoto ni borrar datos.
- Toda modificación SQL debe ser migración aditiva y probar dry-run.
- Push móvil solo puede verificarse completamente en HTTPS y en una PWA instalada.
- El sistema operativo decide el tono del banner Push.

## Inspección de pruebas y migración original

- Playwright ya está configurado y puede importar módulos TypeScript para pruebas de políticas puras.
- La migración original concede CRUD de la propia suscripción mediante RLS y mantiene `register_push_subscription` como `SECURITY DEFINER`.
- `register_push_subscription` reactiva globalmente `is_active`; debe conservarse como compatibilidad, pero los consumidores nuevos usarán la RPC temática.
- El sonido de Entrega ya se desbloquea en la primera interacción y puede reutilizarse como patrón para Cocina.
- `ReadyOrderNotifier` todavía consulta la preferencia global, por lo que debe cambiar a la preferencia local del tema `ready`.

## Inspección de envío y store de pedidos

- `send-order-ready` ya valida JWT con `auth.getUser`, consulta el pedido mediante service role y desactiva endpoints 404/410; ese patrón seguro se conservará.
- La función actual solo permite que Cocina y perfiles administrativos disparen `ready`, y limita destinatarios según el creador. La nueva función deberá seleccionar por tema habilitado.
- `createOrder` usa una RPC transaccional e idempotencia local y puede solicitar `new_order` únicamente después de recibir el pedido confirmado.
- `updateOrderStatus` invoca Push sin bloquear el cambio principal; ese comportamiento de degradación es correcto.
- `fetchActiveOrders` no tiene abort signal ni timeout y elimina ambos arreglos ante cualquier error.
- La promesa global se libera en `finally`, pero un fetch que nunca resuelve impide llegar a ese bloque.
- Realtime crea nombres aleatorios de canal y reconecta siempre en 1.5 s; debe usar backoff y conservar un único canal vivo.

## Inspección de Cocina y corte

- Cocina crea su audio al montar y muestra `soundEnabled = true` antes de comprobar que `audio.play()` sea permitido.
- El desbloqueo solo ocurre al apagar y volver a encender el altavoz; una preferencia ya activa no se recupera con la primera interacción.
- El encabezado operativo tiene espacio junto a Actualizar y Sonido para el control Push temático.
- El cierre usa conteo ciego correctamente y revela el esperado solo después de capturar el contado.
- El preview ya contiene ventas por método y cuentas pendientes, pero no presenta `currentShift.opening_float` ni los movimientos que construyen el esperado.
- La mejora visual puede usar `currentShift` y los totales disponibles sin cambiar RPC ni fórmula SQL.

## Pruebas y tipos de caja

- Playwright levanta Next automáticamente y sus specs TypeScript pueden probar helpers importados sin añadir otra dependencia.
- `CashShiftTotals` ya expone `fund_in_total`, `withdrawal_total`, `expense_total` y `correction_total`.
- `CashClosePreview` hereda esos campos; el único valor adicional para el desglose visual es `currentShift.opening_float`.
- No es necesario modificar la RPC de preview ni los tipos de Supabase para mostrar la fórmula completa.

## Configuración de Edge Functions

- `supabase/config.toml` declara explícitamente `send-order-ready` con `verify_jwt = true` y un import map local.
- La función genérica necesita su propia sección con verificación JWT y puede reutilizar las mismas dependencias versionadas de `web-push`.
- No se requiere leer ni duplicar secretos; las variables VAPID existentes se consumen por nombre en runtime.

## Auditoría de transiciones

- `order_status_log` existe y tiene RLS, pero el código y las migraciones actuales no insertan transiciones.
- Para que la idempotencia de un pedido que vuelve legítimamente a `ready` sea correcta, la nueva migración debe registrar inserciones y cambios de estado mediante un trigger seguro.
- No se realizará backfill de avisos históricos; solo las transiciones posteriores al despliegue pueden producir Push.
