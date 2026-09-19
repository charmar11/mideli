# Plan de diseño: Rincón 404 Food Park y negocios independientes

## Objetivo

Diseñar una evolución de Mideli para que Rincón 404 Food Park pueda registrar y administrar varios negocios independientes, como Mideli y Just Dipping, sin mezclar sus menús, inventarios, usuarios, gastos, pedidos ni permisos.

Esta carpeta contiene las notas de planificación y el contrato de la primera
rebanada. Las migraciones ejecutables viven en `supabase/migrations/`; no se
han aplicado, no incluyen datos reales y no autorizan cambios en producción.

## Artefactos de descubrimiento

- `cuestionario-descubrimiento.md`: cuestionario en lenguaje no técnico para el administrador de plataforma, los dueños y el equipo operativo.
- `01-especificacion-usuarios-seguridad.md`: borrador de identidad, membresías, roles y aislamiento.
- `02-especificacion-pedidos-cobros.md`: borrador de visitas de mesa, pedidos hijos, estados, cajas y cobros.
- `03-especificacion-migracion-piloto.md`: borrador de fases, respaldo, reversión y criterios de aceptación.
- `04-matriz-brechas-y-dependencias.md`: comparación entre el sistema actual y el objetivo multinegocio.
- `05-modelo-logico-y-flujos.md`: modelo conceptual y recorridos operativos.
- `06-mapa-migracion-datos.md`: asociación de tablas, funciones y datos actuales con Mideli.
- `07-diseno-fisico-propuesto.md`: entidades, relaciones, RLS, RPCs, índices y compatibilidad de transición.
- `08-plan-pruebas-y-criterios.md`: pruebas de regresión, aislamiento, pedidos mixtos, cobros, inventario, conexión y piloto.
- `09-plan-migraciones-y-archivos.md`: orden de migraciones, RPCs, triggers, archivos de aplicación y punto de no retorno.
- `10-especificacion-final-y-gates.md`: contrato final del modelo, decisiones recomendadas, seguridad, migración, reversión y criterios de aprobación.
- `11-auditoria-de-preparacion.md`: estado real del código y de Supabase, brechas bloqueantes y etapas recomendadas.
- `12-plan-primera-rebanada-staging.md`: alcance de la primera implementación aislada en staging, sin activar pedidos mixtos.
- `13-checklist-staging-y-reversion.md`: precondiciones del entorno, privacidad de datos y reversión.
- `14-gates-decision-negocio.md`: confirmaciones mínimas del negocio antes de crear staging.
- `15-contrato-fundacion.md`: contrato técnico de tablas, restricciones, RLS y orden de la primera migración.
- `16-matriz-tablas-y-alcance.md`: inventario de tablas actuales y alcance objetivo por dominio.

## Fases

- [x] Fase 1: Confirmar el contexto actual y separar hechos de supuestos.
- [x] Fase 2: Auditar en modo lectura el sistema anterior de Just Dipping y separar hechos de riesgos no verificados.
- [x] Fase 3: Definir límites de Rincón 404 Food Park, negocio, dueño y personal con membresías explícitas.
- [x] Fase 4: Diseñar el modelo de datos y aislamiento por negocio.
- [x] Fase 5: Diseñar altas, pausas, cambios y salida de un negocio.
- [x] Fase 6: Diseñar menú, inventario, usuarios, pedidos y pantallas operativas por negocio.
- [x] Fase 7: Diseñar permisos, seguridad, historial y migración de Mideli y Just Dipping.
- [x] Fase 8: Comparar enfoques y seleccionar la arquitectura.
- [x] Fase 9: Redactar la especificación completa para revisión del usuario.
- [~] Fase 10: Convertir la especificación aprobada en un plan de implementación.

La fase 10 está preparada en forma de diseño y gates. La auditoría de preparación
quedó documentada en `11-auditoria-de-preparacion.md`. Todavía no se han
modificado código funcional, esquema, permisos, datos reales ni despliegues.
La primera implementación deberá comenzar en staging con la fundación de
organización, negocio y membresías, después de cerrar los gates pendientes.
El detalle operativo de esa rebanada está en `12-plan-primera-rebanada-staging.md`.

## Especificaciones acordadas

El diseño se cerrará en este orden para evitar mezclar decisiones independientes:

1. `Usuarios y seguridad`: identidad, login, membresías, roles, Coordinador, meseras globales, personal local, permisos, sesiones y auditoría.
2. `Pedidos y cobros multinegocio`: servicio compartido, órdenes hijas, cocina, estados, correcciones, cuentas, pagos, propinas y devoluciones.
3. `Migración y piloto`: conversión compatible de Mideli, incorporación posterior de Just Dipping, respaldo, reversión, dispositivos, capacitación y criterios de aceptación.

Cada especificación requerirá aprobación antes de convertirla en un plan de implementación.

## Hechos confirmados

- Rincón 404 Food Park es el lugar u organización que contiene varios negocios.
- Mideli es el negocio actualmente operado por el sistema.
- Just Dipping es otro negocio dentro de Rincón 404 Food Park.
- Just Dipping tiene un sistema anterior independiente, público y basado en Firebase/Firestore que debe considerarse en la migración.
- Cada negocio necesita su propio menú, inventario y administración operativa.
- El dueño de cada negocio debe administrar su propio negocio sin depender del administrador que registra o retira negocios de Rincón 404 Food Park.
- Una mesera puede capturar pedidos para más de un negocio.
- La separación de cuentas y cobros puede diseñarse después; la separación de datos y permisos es prioritaria.
- Si un negocio se retira de Rincón 404 Food Park, debe poder dejar de operar sin destruir su historial.
- No se deben inventar negocios, datos, métricas ni nombres que el usuario no haya confirmado.

## Decisiones confirmadas en esta sesión

- La cuenta actual `Administrador` es el dueño de Mideli y no será la cuenta del administrador de plataforma.
- El administrador de plataforma de Rincón 404 tendrá una cuenta separada.
- La cuenta `andrea` corresponde a una mesera global, aunque actualmente figure con el rol técnico `supervisor`.
- La cuenta `Mideli` se usó anteriormente y ya no se utiliza; debe conservarse sin borrarla y quedar inactiva cuando se autorice la operación.
- La cuenta `mauro` corresponde a un cocinero de Mideli, aunque actualmente figure con el rol técnico `supervisor`.
- Solo Mideli utilizará la pantalla de Cocina en la primera etapa.
- Just Dipping utilizará Estado con `Pendiente`, `Preparando` y `Listo`, sin pantalla de Cocina.
- La mesera global podrá enviar pedidos a cualquier negocio; el personal local solo podrá operar y enviar pedidos de su propio negocio.

- El objetivo es adaptar el sistema completo a múltiples negocios independientes dentro de Rincón 404 Food Park.
- Cada negocio debe poder permanecer, pausarse, archivarse y restaurarse sin destruir su historial.
- El administrador máximo de Rincón 404 Food Park podrá crear negocios y entregar el acceso inicial al dueño de forma rápida.
- El rol operativo compartido se llamará `Coordinador`. Podrá crear, activar y desactivar cuentas de meseras globales, además de administrar el plano y la numeración de las mesas compartidas, sin administrar al personal interno de cada negocio.
- El dueño de cada negocio administrará su propio menú, inventario, historial de ventas, cortes, gastos y operación.
- El dueño de cada negocio será responsable de invitar, activar, desactivar y asignar roles a su propio personal.
- El administrador máximo no deberá intervenir en la administración diaria del personal de cada negocio.
- Los datos operativos de un negocio no deben afectar ni mezclarse con los de otro.
- La cuenta y el canal de WhatsApp actuales permanecerán exclusivos de Mideli durante la primera etapa.
- Just Dipping se conserva como nombre confirmado, pero no se crearán registros reales hasta que el usuario indique que corresponde registrarlo.
- La separación de cobros puede implementarse después, pero la estructura de pedidos debe quedar preparada para separar negocios desde el inicio.
- El sistema anterior de Just Dipping será una fuente de migración a validar, no una dependencia operativa permanente ni una fuente que deba mezclarse directamente con Mideli.
- La preferencia provisional es conservar el historial anterior de Just Dipping, pero esta decisión no está aprobada hasta consultarla con los demás dueños involucrados.
- La migración comenzará con Mideli hacia el nuevo modelo, sin cambiar sus credenciales ni su comportamiento visible.
- Just Dipping se incorporará después de comprobar que Mideli funciona correctamente y de obtener las autorizaciones y datos reales necesarios.

## Supuestos pendientes de validar

- Qué negocios usan cocina, barra, preparación directa o una combinación.
- Confirmar con los demás dueños si autorizan conservar el historial, cortes y movimientos anteriores de Just Dipping y definir el alcance exacto de esa conservación.
- Qué fecha y procedimiento de corte evitarán capturas duplicadas entre el sistema anterior de Just Dipping y la plataforma nueva.
- Qué funciones del sistema anterior de Just Dipping deben conservarse, reemplazarse o retirarse, especialmente retiro, corte, impresión y entrega.

## Decisiones que no se tomarán todavía

- No crear tablas ni columnas.
- No cambiar RLS, roles ni autenticación.
- No migrar datos reales.
- No crear cuentas reales para dueños.
- No desplegar.

## Errores o riesgos conocidos

| Riesgo | Tratamiento en diseño |
|---|---|
| El código actual asume un solo local | Diseñar una migración gradual con Mideli como negocio inicial |
| Borrar un negocio puede romper ventas históricas | Usar archivado y conservación histórica; definir borrado irreversible solo para datos sin dependencias |
| Un administrador puede ver datos de otro negocio | Aislamiento en base de datos y servidor, no solo filtros de interfaz |
| Una mesera trabaja con varios negocios | Permisos por membresía y selección de negocio en el POS |
| Algunos negocios no usan cocina | Modelar estaciones y modo de cumplimiento configurables |
| El sistema anterior de Just Dipping expone Administración e Historial sin login visible | No reutilizar su sesión ni confiar en su seguridad; auditar reglas de Firebase y migrar a permisos por negocio |
| El catálogo público de Just Dipping muestra una categoría repetida | Importar con validación, deduplicación y mapeo estable de categorías y modificadores |
| Los dos sistemas podrían operar al mismo tiempo | Definir una fecha de corte y evitar doble captura de ventas, caja e inventario |
