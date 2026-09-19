# Progreso del flujo de trabajo

## 2026-09-19

- Se leyeron `AGENTS.md` y `.opencode/plans/mideli-context.md` antes de actuar.
- Se revisó el estado del repositorio y se conservaron todos los cambios
  existentes.
- Se clonaron temporalmente las cinco fuentes solicitadas en una carpeta de
  auditoría fuera del repositorio.
- Se revisaron sus README, manifiestos, skills principales, rutas de Codex y
  hooks relevantes sin ejecutar sus instaladores completos.
- Se instalaron globalmente en Codex:
  - `i-have-adhd`
  - `archify`
  - `graphify`
  - `ponytail-review`
  - `ponytail-audit`
  - `architecture-decision-records`
  - `verification-loop`
  - `security-review`
  - `database-migrations`
- Se instaló `graphifyy==0.9.64` como herramienta local para que la skill pueda
  ejecutarse cuando se solicite.
- Graphify se instaló para Codex con `install --platform codex`, sin hook de
  proyecto, sin `AGENTS.md` adicional y sin generar `graphify-out/`.
- `graphify --version` respondió `0.9.64`.
- `archify doctor` terminó con todos sus checks en estado correcto.
- Se verificó que cada skill instalada contiene un `SKILL.md` válido.
- Se comprobó que la instalación no agregó archivos al estado del repositorio.

## Siguiente acción

Aplicar el flujo a la preparación multinegocio: cerrar la matriz real de
alcance por tabla, RPC, trigger y consumidor, validar la línea base y preparar
la primera migración aditiva para staging. No tocar producción ni habilitar
Just Dipping hasta superar los gates de regresión y aislamiento.

## Auditoría de preparación multinegocio

- Se confirmó en el código local que el esquema operativo todavía no tiene
  `business_id`, organización ni membresías por negocio.
- Se identificó que catálogo, pedidos, inventario, pagos, caja, reportes y
  varias configuraciones siguen siendo globales.
- Se identificó que `cash_shifts` tiene una unicidad de caja abierta global y
  que `order_folio_counter` es global.
- Se identificó que las políticas históricas y varias funciones privilegiadas
  se basan en roles globales, por lo que no son suficientes para aislar
  negocios.
- Se documentó la matriz y el orden de migración en
  `docs_dev/food-garden-multi-business/11-auditoria-de-preparacion.md`.
- La línea base pasó `npm run lint`, `npm run build` y `git diff --check`.
- `npx supabase migration list` confirmó que las migraciones locales y remotas
  están alineadas hasta `20260915190000`.
- `npx supabase db push --linked --dry-run` confirmó que no hay migraciones
  pendientes y no aplicó cambios.
- Una consulta remota de solo lectura confirmó `0` columnas `business_id` o
  `organization_id` y la existencia del índice global
  `cash_shifts_single_open_idx`.
- El asesor de rendimiento remoto reportó avisos existentes de índices de
  claves foráneas faltantes y políticas RLS permisivas duplicadas. Deben
  corregirse o aceptarse explícitamente antes del aislamiento multinegocio.
- El asesor de seguridad remoto terminó en modo de solo lectura sin modificar la
  base. Reportó 36 hallazgos: 21 informativos de RLS sin política, 3 advertencias
  de funciones `SECURITY DEFINER` ejecutables por `anon`, 11 advertencias de
  funciones `SECURITY DEFINER` ejecutables por `authenticated` y 1 advertencia
  por protección de contraseñas filtradas desactivada. Se mantiene como gate de
  endurecimiento antes de habilitar el aislamiento multinegocio.
- Graphify analizó 204 archivos de código de `src` en modo temporal y confirmó
  las comunidades de Mesero, Estado, Cocina, pagos, caja, inventario y
  WhatsApp. Sus artefactos generados fueron retirados del repositorio.
- La consulta remota de perfiles confirmó cuatro registros activos. La
  documentación ahora distingue `profiles.full_name` de los identificadores
  reales de Auth y exige resolver cada `auth.users.id` en staging antes de crear
  membresías.
- Se dejó explícito que todavía no se comprobó un proyecto Supabase de staging
  separado ni un Preview con variables aisladas; ambos son gates antes de la
  primera migración.
- `npx supabase branches list --output json` devolvió `[]` en el proyecto
  vinculado; no existe todavía una rama Preview de Supabase.
- La ayuda del CLI confirmó que `supabase branches create` permite clonar datos
  con `--with-data`; se agregó un gate de privacidad para no llevar PII a
  staging por defecto.
- Se sincronizaron `README.md`, `PRODUCT.md`, `AGENTS.md`, `docs/ARCHITECTURE.md`,
  `docs/DECISIONS.md`, `docs/OPERATIONS.md`, `docs/releases/v0.9-piloto.md` y
  el contexto OpenCode para distinguir el sistema actual de un solo negocio
  de la evolución multinegocio aprobada pero todavía no implementada.
- Se creó `13-checklist-staging-y-reversion.md` con precondiciones de Preview,
  privacidad de datos, aislamiento de webhooks, línea base y rollback aditivo.
- Se creó el diagrama navegable `arquitectura-objetivo.html` con su
  especificación JSON. Archify validó 9/9 checks en perfil `showcase`, y el
  navegador no encontró overflow en los viewports de escritorio probados.
- Se redujeron las decisiones de entrada a staging a cuatro confirmaciones
  explícitas: entorno aislado, identidad de plataforma, regla de retención y
  datos anonimizados para el piloto.
- Se redactó `15-contrato-fundacion.md` con el contrato PostgreSQL de la primera
  rebanada, incluyendo UUID, `timestamptz`, FKs indexadas, restricciones de
  alcance, RLS, capacidades y reversión sin SQL ejecutable.
- Se volvió a ejecutar `npm run lint` y `npm run build`; ambos terminaron con
  código 0 después de sincronizar la documentación.
