# Progreso: licencias independientes por negocio

## 2026-09-27 — Implementado y desplegado

- Aplicado el modelo de licencias manuales independientes por negocio. Sólo la
  cuenta Rincón 404 puede asignar, renovar, suspender, reactivar y revisar el
  historial. `app_license.status` quedó como interruptor técnico global; su
  vencimiento antiguo ya no representa la vigencia comercial.
- Se hizo backfill sin extender vigencias: Mideli y Just Dipping mantienen su
  fecha local inicial `2026-10-01`; cada negocio recibió su registro de
  auditoría `migrated`.
- Aplicadas en Supabase las migraciones `20260927090929`, `20260927090931`,
  `20260927090934`, `20260927091600` y `20260927091700`. La última corrigió
  una ambigüedad SQL en la lectura del historial de licencias; la anterior
  corrigió la RPC que asigna personal local.
- La escritura y lectura operativa se bloquean por negocio. Las meseras
  globales ven opciones sin licencia como deshabilitadas, sin fecha, deuda ni
  detalles de la licencia; no se carga el catálogo no disponible.
- WhatsApp queda detenido completamente para clientes si Mideli no está
  disponible: sin procesamiento de mensajes, respuestas, pedidos, handoff
  humano ni liberación de tareas programadas. Los envíos salientes también
  vuelven a validar la licencia inmediatamente antes de llamar a Meta.
- Verificación: `npm run lint`, `npm run build` y 558 pruebas E2E pasaron
  (186 escritorio, 186 tablet, 186 móvil). La prueba de WhatsApp cubre que una
  licencia denegada no produce llamada saliente a Meta.
- Supabase remoto confirma ambos negocios activos hasta `2026-10-01`, un
  administrador activo de licencias, 29 guards por negocio, 33 políticas de
  lectura y cero triggers de escritura del guard global anterior.
- `db lint --linked --fail-on error` sigue notificando que no puede resolver
  estáticamente las tablas temporales creadas dentro de dos RPCs de pedidos
  (una existente y otra nueva); también informa warnings existentes y uno de
  estabilidad en el cálculo de meses. La ambigüedad real del historial y de
  alta de personal ya no aparece. No se alteraron pedidos, caja ni fechas para
  probar vencimientos.
- Deploy real a Vercel producción: `dpl_BCQoEKpMnYSuK7Qren9aXtVuhWvz`, estado
  `READY`, alias [mideli.vercel.app](https://mideli.vercel.app).
- No se mandó un mensaje de prueba real a clientes ni se simuló vencimiento en
  producción. El código y la base se verificaron; un pedido real de prueba
  debe coordinarse con el equipo en horario seguro.

## Estado

Pendiente: revisión del plan técnico por el usuario. No se implementó nada, no se consultó Supabase remoto, no se aplicó migración y no se hizo deploy.
