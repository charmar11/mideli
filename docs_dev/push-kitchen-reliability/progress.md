# Progreso: Push, Cocina y caja

## 2026-08-13

- Se revisó el contexto obligatorio del proyecto.
- Se inspeccionaron el cliente Push, su control, el service worker, Cocina, order store, función Edge y cierre de caja.
- Se verificó el estado remoto necesario de Supabase sin leer secretos.
- El usuario aprobó preferencias independientes para nuevos pedidos y pedidos listos.
- Se escribió, auto-revisó y comprometió la especificación técnica.
- Se creó este plan de implementación.
- Se añadieron 5 pruebas de política para temas Push, supresión en primer plano, backoff, timeout y fórmula de caja.
- Se comprobó primero el fallo por módulos inexistentes y después el resultado correcto en Playwright Desktop.
- Se agregaron helpers puros sin dependencias de navegador o Supabase.
- Se creó la migración aditiva `20260813120000_push_topics_and_delivery_events.sql`.
- Las 41 migraciones previas están alineadas entre local y remoto.
- El dry-run remoto reconoce únicamente la nueva migración y terminó correctamente.
- El cliente Push ahora guarda y consulta `ready` y `kitchen` de forma independiente y no oculta errores remotos.
- El service worker evita duplicar banners cuando la vista responsable está visible.
- Cocina ya tiene control Push separado del altavoz local y desbloqueo de audio en una interacción válida.
- El store de pedidos usa timeout, conserva datos previos y aplica backoff a Realtime.
- Se creó la Edge Function genérica e idempotente para pedidos nuevos y listos.
- El corte muestra fondo inicial y todos los componentes del efectivo esperado.
- La migración se aplicó y local/remoto quedaron alineados en `20260813120000`.
- La comprobación remota confirmó 2 columnas temáticas, RLS, trigger y ambas RPC.
- Nueve suscripciones activas conservaron Entrega; Cocina quedó en cero hasta activación explícita.
- `send-order-notification` está ACTIVE, versión 1 y con verificación JWT.
- Una prueba remota dentro de transacción confirmó que pausar Entrega conserva Cocina activa; la transacción se revirtió sin dejar una suscripción de prueba.
- La función remota rechazó una solicitud sin JWT con HTTP 401.
- Los asesores no reportaron advertencias de RLS o índices en las tablas nuevas; mantienen advertencias preexistentes y la advertencia esperada de la RPC temática `SECURITY DEFINER`, que valida sesión y perfil activo.
- Las 36 pruebas Playwright pasan en escritorio, tablet y móvil.
- ESLint y el build de producción pasan; Serwist empaquetó 71 recursos de la PWA.
- El dry-run final confirma que la base remota está actualizada.
- Se dejó un checklist de validación física para Cocina, Entrega e independencia por tema.
- La función anterior `send-order-ready` se actualizó a versión 5 para respetar `ready_alerts` durante la transición de clientes antiguos.

## Verificaciones pendientes

- Validación Push física en PWA instalada.

## Despliegue

- La versión de producción `90389965202a` quedó publicada en `https://mideli.vercel.app`.
- Inicio, salud, manifiesto PWA y service worker responden con HTTP 200.
- El endpoint de salud confirma estado `ok` y la misma versión desplegada.
