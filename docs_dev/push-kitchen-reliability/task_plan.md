# Plan: Push por tema, Cocina resiliente y corte claro

## Meta

Implementar la especificación aprobada en `docs/superpowers/specs/2026-08-13-push-kitchen-resilience-cash-close-design.md` sin romper las suscripciones existentes, el flujo de pedidos ni la contabilidad de caja.

## Fases

- [x] Fase 1: Capturar línea base y crear pruebas de regresión que fallen.
- [x] Fase 2: Crear y validar la migración aditiva de preferencias e idempotencia.
- [x] Fase 3: Separar la configuración Push por tema y endurecer el service worker.
- [x] Fase 4: Implementar envío de nuevos pedidos y pedidos listos.
- [x] Fase 5: Corregir carga, reconexión y audio local de Cocina.
- [x] Fase 6: Mostrar fondo inicial y fórmula en el cierre de caja.
- [x] Fase 7: Aplicar Supabase, desplegar funciones y verificar seguridad.
- [x] Fase 8: Ejecutar pruebas, lint, build y preparar validación física PWA.

## Pasos de implementación

### Fase 1

1. Inspeccionar por completo los módulos afectados y sus consumidores.
2. Confirmar scripts y patrón de pruebas Playwright existente.
3. Agregar pruebas pequeñas para política de Push, timeout y fórmula de caja antes de implementar los helpers.
4. Ejecutarlas y registrar el fallo esperado.

### Fase 2

1. Crear una migración posterior a la última migración local.
2. Agregar `ready_alerts` y `kitchen_alerts` a `push_subscriptions`.
3. Migrar `is_active` existente a `ready_alerts` y mantener `kitchen_alerts` apagado.
4. Crear `push_notification_events` con RLS y clave idempotente.
5. Crear RPC autenticada para guardar una preferencia por endpoint y tema.
6. Crear RPC privada para reclamar de manera atómica un evento de envío.
7. Agregar pruebas SQL transaccionales o consultas de comprobación sin borrar datos.
8. Ejecutar lista y dry-run antes de aplicar.

### Fase 3

1. Crear tipos y política pura para temas `kitchen` y `ready`.
2. Cambiar el almacenamiento local a claves independientes.
3. Cambiar lectura, activación y pausa para consultar el tema y verificar la respuesta remota.
4. Convertir `PushNotificationControl` en un componente configurable por tema.
5. Mantener Mesero con `ready` y agregar Cocina con `kitchen`.
6. Incorporar topic y eventId al payload del service worker.
7. Suprimir banners solo si la vista responsable está visible.

### Fase 4

1. Crear `send-order-notification` a partir del patrón seguro de `send-order-ready`.
2. Validar JWT, perfil activo, pedido y transición en servidor.
3. Reclamar el evento idempotente.
4. Seleccionar todas las suscripciones activas del tema.
5. Desactivar endpoints vencidos y registrar resultados.
6. Invocar `new_order` después de crear un pedido confirmado.
7. Invocar `ready` después de confirmar la transición.
8. Mantener el pedido válido aunque Push falle.

### Fase 5

1. Agregar abort signal y timeout a la consulta de pedidos.
2. Liberar siempre la promesa deduplicada.
3. Conservar pedidos previos ante error y exponer conexión degradada.
4. Evitar consultas solapadas.
5. Reemplazar reconexión fija por backoff acotado.
6. Desbloquear audio en una interacción real y reflejar su estado verdadero.
7. Verificar que pedido nuevo tenga sonido único y animación identificable.

### Fase 6

1. Agregar un helper puro para el desglose de efectivo esperado.
2. Mostrar fondo inicial, efectivo vendido, entradas, retiros, gastos y correcciones.
3. Mantener contado, diferencia y autorización actuales.
4. Verificar que no cambia la fórmula remota ni el historial.

### Fase 7

1. Revisar migración y diff.
2. Ejecutar `npx supabase migration list`.
3. Ejecutar `npx supabase db push --linked --dry-run`.
4. Aplicar solo la nueva migración.
5. Desplegar `send-order-notification` con JWT verificado.
6. Revisar asesores de seguridad y rendimiento.
7. Comprobar columnas, funciones, RLS y estado de la función remota.

### Fase 8

1. Ejecutar pruebas de regresión y smoke tests aplicables.
2. Ejecutar `npm run lint`.
3. Ejecutar `npm run build`.
4. Revisar `git diff --check` y cambios no relacionados.
5. Documentar el checklist de prueba HTTPS en dispositivos reales.

## Decisiones

| Decisión | Motivo | Fecha |
|---|---|---|
| Preferencias por tema y dispositivo | Evita mezclar Cocina y Entrega | 2026-08-13 |
| Propietario, admin y supervisor pueden usar ambos temas | Solicitud explícita del dueño | 2026-08-13 |
| Aviso local en vista responsable, Push fuera de ella | Evita duplicados sin perder alertas | 2026-08-13 |
| Conservar datos durante fallos transitorios | Cocina debe seguir viendo pedidos | 2026-08-13 |
| No cambiar fórmula contable | `opening_float` ya participa correctamente | 2026-08-13 |

## Errores encontrados

| Error | Intento | Resolución |
|---|---:|---|
| `rg.exe` devolvió acceso denegado | 1 | Usar `Select-String` y lecturas dirigidas en PowerShell |
| Búsqueda recursiva inicial de pruebas agotó 10 s | 1 | Consultar primero el directorio raíz y después `tests` de forma directa |
| La prueba inicial no encontró los módulos de política | 1 | Fallo esperado de TDD; se agregaron helpers aislados y las 5 pruebas pasaron |
| Build: `system-diagnostics` no contemplaba el nuevo estado `error` ni los temas | 1 | Actualizar diagnóstico para revisar Entrega y Cocina por separado |
| `db query` con SQL multilínea llegó vacío por el parseo de PowerShell | 1-3 | Cambiar de enfoque y usar un archivo SQL temporal eliminado después de verificar |
| `db push` no pudo actualizar el catálogo pg-delta local porque Docker no está activo | 1 | La migración sí se aplicó; confirmar con `migration list` y consultas remotas |
| Lint rechazó sincronizar localStorage con `setState` directo en un efecto | 1 | Diferir la sincronización al callback de un temporizador y mantener el HTML de hidratación estable |
| Build detectó tipos implícitos en el callback Realtime envuelto | 1 | Declarar de forma explícita el estado y error que ya acepta el manejador |
