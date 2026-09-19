# Runbook de migración reversible de Mideli

Este runbook describe cómo pasar Mideli al modelo multinegocio sin cambiar
sus credenciales, folios ni el canal de WhatsApp. No autoriza por sí mismo una
migración en producción.

## Estado actual

- Las migraciones multinegocio están versionadas localmente y todavía no se
  consideran aplicadas a producción.
- La validación aislada se ejecuta en GitHub Actions con una base efímera de
  Supabase local.
- WhatsApp conserva el alcance exclusivo de Mideli.
- La primera operación mixta de comedor crea una comanda, una visita de mesa
  y una cuenta independiente por negocio.

## Fases obligatorias

### 0. Publicar compatibilidad antes del esquema

La versión compatible del frontend debe estar publicada antes de ejecutar las
migraciones en producción. La migración revoca algunos RPC heredados y el
frontend anterior podría dejar de crear pedidos. La versión compatible puede
operar con el esquema actual mediante fallback y después usar el contexto
multinegocio cuando las migraciones estén aplicadas.

Orden mínimo:

1. CI verde en la rama que se va a publicar.
2. Deploy de la versión compatible.
3. Comprobar `/api/health` y un acceso normal a la aplicación.
4. Solo después continuar con el respaldo y `db push --linked`.

### 1. Preflight sin escritura

Antes de aplicar cualquier migración:

1. Confirmar que la rama de trabajo está limpia o que los cambios pendientes
   fueron identificados.
2. Ejecutar `npx supabase migration list`.
3. Ejecutar `npx supabase db push --linked --dry-run`.
4. Ejecutar el preflight de solo lectura:
   `npx supabase db query --linked --output-format json --file supabase/verification/mideli_preflight.sql`.
   Debe reportar cuatro perfiles activos esperados vinculados a Auth, cero
   turnos abiertos, cero huérfanos y cero pagos sin turno o pedido asociado.
5. Conservar el resultado del preflight, sin datos personales, como evidencia
   de conteos de pedidos, pagos, turnos, inventario, categorías y productos.
6. Confirmar que `auth.users.id` de `Administrador`, `andrea`, `mauro` y
   `Mideli` coincide con la cuenta que se pretende conservar. Nunca resolver
   una cuenta por alias o por `profiles.full_name` en una operación real.

Si falla una validación de identidad, conteo o ambigüedad, se detiene el
proceso. No se corrige directamente una tabla para forzar el paso.

El preflight actual de producción pasó esas comprobaciones. Todavía falta
comprobar un respaldo restaurable externo antes de ejecutar `db push --linked`.

### 2. Gate aislado

El workflow `Verify Mideli` debe pasar:

- `npm run lint`.
- `npm run build`.
- Todas las migraciones sobre una base local efímera.
- Los checks pgTAP estructurales y de seguridad.
- La comprobación de que no se usó la URL de producción.

La base efímera no es un staging persistente y no contiene los clientes reales.
Sirve para validar DDL, RLS, RPCs, triggers, índices y pruebas negativas.

### 3. Expand y backfill

Aplicar únicamente migraciones aditivas y verificar cada corte:

1. Fundación de organización, negocios, membresías y capacidades.
2. Asociación de Mideli y del plano compartido.
3. Catálogo e inventario de Mideli.
4. Pedidos, visitas, cuentas y comanda mixta.
5. Caja, pagos, gastos, impresión y Push.

Después de cada grupo se comprueba que:

- ningún registro de Mideli quedó sin `business_id` cuando la etapa lo exige;
- ningún pedido, línea, receta, movimiento, pago o caja cruza negocios;
- los folios históricos no cambiaron;
- la caja permite una abierta por negocio, no una global;
- el login existente sigue resolviendo la membresía esperada;
- WhatsApp sigue apuntando únicamente a Mideli.

### 4. Activación controlada

La interfaz multinegocio solo se activa cuando el grupo de migraciones y sus
pruebas ya pasaron. Se inicia con Mideli seleccionado y se prueba un turno
real con:

- un pedido solo de Mideli;
- una mesa con productos de dos negocios;
- dos cuentas separadas y dos cajas abiertas;
- un cobro por negocio;
- cierre y consulta de historial por negocio.

## Reversión

La reversión no consiste en borrar tablas ni en ejecutar `db reset` remoto.

### Antes de activar

Si el gate falla, se corrige la rama y se vuelve a ejecutar CI. Producción no
se toca.

### Después de aplicar esquema, antes de usarlo

Se mantiene el modo compatible de Mideli. Si una verificación falla, se pausa
la activación del selector y se conserva la ruta heredada mientras se revisa
la causa.

### Después de crear datos nuevos

No se elimina la fundación ni se deshacen filas a mano. Se usa una nueva
migración forward-only para pausar una capacidad, archivar un negocio o
restaurar una relación corregida. Los pedidos, cobros y cortes se conservan
como historial auditable.

### Punto de restauración

Antes de la primera escritura en producción debe existir un respaldo externo
cuya restauración haya sido comprobada. El respaldo debe conservarse fuera de
la aplicación y no debe incluirse en GitHub.

## Criterios de detención

Detener el piloto y no incorporar Just Dipping si ocurre cualquiera de estos
casos:

- una cuenta ve menú, inventario, caja o pedidos de otro negocio sin permiso;
- una mesa mixta produce una sola cuenta o un solo total cuando debía separar;
- un cobro cae en la caja equivocada;
- un pedido no llega a Estado o a la estación correcta;
- cambia un folio histórico o se duplica una comanda por reintento;
- el login existente de Mideli deja de entrar;
- una migración no tiene una prueba de verificación y una ruta forward-only.
