# Iniciativa multinegocio

## Estado actual

La iniciativa está en preparación técnica. El sistema productivo sigue siendo
de un solo negocio y WhatsApp continúa siendo exclusivo de Mideli. Todavía no
se han aplicado migraciones multinegocio, no se ha creado Just Dipping en la
base de datos y no se ha habilitado un selector de negocio.

La primera implementación autorizada para preparar es una fundación aditiva en
staging:
organización, negocio inicial, membresías, capacidades, auditoría y guardas.
No debe cambiar el login ni el comportamiento visible de Mideli.

Las migraciones versionadas de esta fundación ya existen en
`supabase/migrations/20260919082935_multibusiness_foundation.sql` y
`supabase/migrations/20260919083624_multibusiness_capability_catalog.sql`.
Todavía no se han aplicado a Supabase porque el proyecto no tiene una rama de
staging disponible y no se debe escribir en producción.

El repositorio también ejecuta lint, build, migraciones locales y pgTAP en
GitHub Actions. Esto permite validar el SQL en un runner con Docker sin pagar
Branching ni crear otro proyecto Supabase.

## Diagrama de referencia

- [Arquitectura objetivo en HTML](artifacts/arquitectura-objetivo.html)
- [Especificación del diagrama](artifacts/arquitectura-objetivo.json)

El artefacto fue validado con Archify en perfil `showcase`: 9 comprobaciones
aprobadas, cero errores y cero advertencias. La verificación automática del
navegador no encontró overflow en los viewports de escritorio probados.

## Orden de lectura

1. `.opencode/plans/mideli-context.md`: contexto operativo y decisiones vigentes.
2. `11-auditoria-de-preparacion.md`: evidencia del código y de Supabase, brechas y gates.
3. `12-plan-primera-rebanada-staging.md`: alcance y criterios de la primera implementación.
4. `13-checklist-staging-y-reversion.md`: preparación operativa, privacidad y rollback.
5. `14-gates-decision-negocio.md`: las cuatro confirmaciones mínimas antes de crear staging.
6. `15-contrato-fundacion.md`: tablas, restricciones, RLS y orden de la primera migración.
7. `16-matriz-tablas-y-alcance.md`: inventario de tablas actuales y alcance objetivo por dominio.
8. `10-especificacion-final-y-gates.md`: contrato funcional y límites de seguridad.
9. `01-especificacion-usuarios-seguridad.md`: identidad, roles y membresías.
10. `02-especificacion-pedidos-cobros.md`: pedidos, estados, cuentas y cobros.
11. `03-especificacion-migracion-piloto.md`: migración, piloto y reversión.
12. `04-matriz-brechas-y-dependencias.md`: comparación entre el sistema actual y el objetivo.
13. `05-modelo-logico-y-flujos.md` y `06-mapa-migracion-datos.md`: modelo y asociaciones actuales.
14. `07-diseno-fisico-propuesto.md`, `08-plan-pruebas-y-criterios.md` y `09-plan-migraciones-y-archivos.md`:
    diseño de datos, pruebas y orden técnico.

## Reglas de continuidad

- No inventar alias, correos, IDs de Auth, dueños, negocios ni datos de Just Dipping.
- Verificar el `auth.users.id` real antes de crear cualquier membresía.
- No usar producción como staging ni escribir en producción desde una Preview.
- No clonar PII de producción a staging por defecto; usar fixtures anonimizados
  o documentar y restringir cualquier copia controlada.
- No hacer `business_id` obligatorio en la primera migración.
- No borrar historiales para retirar un negocio: usar estados de ciclo de vida.
- Mantener WhatsApp fijado a Mideli hasta que exista una decisión posterior.
- No confiar en filtros de React: el aislamiento debe existir en RLS, RPCs,
  Server Actions, triggers, Realtime y cachés.

## Siguiente gate

Antes de aplicar el SQL multinegocio deben existir una base Supabase de staging,
un despliegue Preview con variables separadas, un respaldo restaurable y una
versión estable identificada. Después se puede implementar únicamente la
fundación descrita en `12-plan-primera-rebanada-staging.md`.
