# Plan: licencias independientes por negocio

## Objetivo

Preparar una implementación segura del control de licencia por negocio, sin interrumpir los locales vigentes, sin alterar datos operativos y manteniendo el acceso de meseras globales a otros locales al corriente.

Alcance actualizado: implementación aprobada por el usuario el 2026-09-27, con migración remota y despliegue a producción al terminar, sujeto a los gates de seguridad y verificación. No cambiar fechas reales para simular estados ni alterar datos operativos.

## Fases

- [x] Fase 1: Recopilar decisiones de producto y aprobación del diseño.
- [x] Fase 2: Actualizar la especificación con el comportamiento de meseras globales y estados de menú.
- [x] Fase 3: Hacer reconocimiento estático de consumidores principales de licencia, selector, pedidos y WhatsApp. La auditoría exhaustiva de cada tabla queda como puerta obligatoria antes de implementar.
- [x] Fase 4: Definir modelo propuesto, compatibilidad, seguridad, fases de migración y reversión.
- [x] Fase 5: Preparar matriz de pruebas y criterios de salida del piloto.
- [x] Fase 6: Usuario revisó y aprobó el diseño y pidió proceder con implementación y deploy.
- [x] Fase 7: Completar inventario de consumidores, RPC, triggers, RLS, Storage, rutas y procesos asíncronos.
- [x] Fase 8: Verificar estado remoto en modo de sólo lectura y decidir backfill sin tocar vigencias manualmente.
- [x] Fase 9: Implementar modelo, autorización exclusiva de `rincon404`, compatibilidad y enforcement por negocio.
- [x] Fase 10: Implementar estados de acceso, selector neutral para meseras globales y aislamiento de WhatsApp.
- [x] Fase 11: Dry-run de migración, pruebas, lint/build, aplicar migración y desplegar producción.
- [x] Fase 12: Verificar deployment y estado remoto sin revelar información sensible.

## Decisiones aprobadas

| Decisión | Resultado |
|---|---|
| Alcance del bloqueo | Sólo el negocio con licencia vencida o suspendida; otros negocios vigentes siguen operando. |
| Experiencia de empleados del local | Pueden autenticarse, pero ven sólo aviso de acceso pendiente; no consultan módulos en modo lectura. |
| Dueño de licencias | Sólo la cuenta de plataforma rincon404. |
| Deuda y cobros | No calcular saldos, deuda, pagos parciales ni facturas; control manual de vencimiento. |
| Locales activos al migrar | Copiar la fecha de vencimiento global actual como fecha inicial individual. |
| Local nuevo | Nace como borrador bloqueado; la vigencia inicia al activarse. |
| Renovación | Antes del vencimiento extiende desde la fecha vigente; vencido inicia desde la fecha de renovación. |
| Pausa del local | No detiene el tiempo de licencia. |
| Comanda mixta | Se bloquean sólo líneas del local no vigente; se puede continuar con locales vigentes. |
| Licencia global comercial | No seguirá venciendo/bloqueando a todos; un control técnico de emergencia, si se conserva, es separado. |
| WhatsApp de Mideli | Sin licencia vigente, no contesta mensajes, no crea pedidos ni inicia atención humana; responde sólo al proveedor para evitar reintentos. |
| Meseras globales | No mostrar concepto, fecha ni aviso de licencia. Sólo mostrar la opción autorizada del negocio; si no está disponible, queda atenuada y no seleccionable, sin cargar categorías ni productos. |

## Errores encontrados

| Error | Intento | Resolución |
|---|---:|---|
| PowerShell interpretó patrones de ruta estilo glob como rutas locales no válidas en una búsqueda de archivos SQL. | 1 | Repetí la búsqueda con los archivos como raíz y el patrón de nombres en la opción --glob de ripgrep. |
| PowerShell volvió a interpretar un glob de documentos como ruta al verificar consistencia. | 1 | Repetir la consulta enumerando los cinco archivos de forma explícita. |
| Se intentó leer `security-review/SKILL.md` desde una raíz incorrecta. | 1 | Releerlo completo desde `.codex/skills/security-review/SKILL.md`. |
| La lectura directa de `https://supabase.com/changelog.md` fue rechazada por el visor por su content-type Markdown. | 1 | Consultar el changelog oficial de Supabase por búsqueda y continuar con documentación primaria accesible. |
| `supabase/search_docs` no pudo renovar el token OAuth. | 1 | Usar documentación oficial accesible; no tratar la falla de autenticación como evidencia técnica. |
| Las herramientas de lectura remota de Supabase (`execute_sql` y `list_migrations`) también fallaron al renovar OAuth. | 1 | Probar lectura con Supabase CLI enlazada al proyecto; si no está autenticada, detener cambios remotos y reportar el bloqueo. |
| Una inspección paralela de catálogos remotos superó el tiempo de espera para dos consultas y la salida impresa omitió metadatos de sesión. | 1 | Repetir consultas de catálogo de una en una y conservar el resultado completo de `exec_command`; no interpretar una salida vacía como cero filas. |

## Riesgos identificados

| Riesgo | Mitigación por definir |
|---|---|
| Retirar el bloqueo global antes de proteger cada tabla o RPC | Migración y código aditivos; retiro al final, tras inventario y pruebas. |
| Consultar un negocio equivocado en datos hijos sin business_id | Seguir relaciones a la fila padre y probar cada camino de escritura. |
| Una ruta directa o cliente de servicio elude el proxy | Validar en servidor/RPC/DB además de la interfaz. |
| Menú deshabilitado de mesera revela pago o deuda | Exponer sólo estado genérico de disponibilidad, nunca datos de licencia. |
| Comanda existente conserva productos de local que vence | Revalidar al enviar, identificar sus líneas y permitir retiro/exclusión explícita. |
| Corte técnico de licencia confunde al usuario con deuda | Mensaje temporal de verificación; bloquear nuevas escrituras del negocio hasta verificar autorización. |
| WhatsApp ya tiene tarea o conversación en curso | Diseñar cómo suspender envíos y procesamiento nuevo, sin borrar conversaciones ni órdenes existentes. |
| Migración toma un snapshot equivocado de vigencias o negocios | Leer estado real en ventana de aplicación, comparar conteos y fechas antes/después. |

## Verificación propuesta

- Auditoría estática completa de todas las lecturas de app_license y sus efectos en rutas, triggers, RLS, Storage, RPC, tareas programadas y webhook.
- Matriz de pruebas para negocio activo, borrador, próximo a vencer, vencido, suspendido, pausado y reactivado.
- Pruebas diferenciadas para dueño local, empleado local, mesera global y cuenta rincon404.
- Pruebas de carrito con productos de varios negocios y cambio de licencia entre agregar y enviar.
- Pruebas de WhatsApp vencido: sin respuesta de negocio, sin pedido, sin handoff humano y sin reintentos del proveedor.
- npm run lint, npm run build, pruebas SQL/relevantes, dry-run de migración y salud post-deploy si se autoriza implementación.

## Registro de progreso

- 2026-09-27: diseño de producto aprobado; se agrega requisito de mostrar menús no disponibles a meseras globales como deshabilitados sin revelar licencias.
- 2026-09-27: el usuario autorizó implementación, migración y deploy de producción al final, condicionados a pruebas de seguridad y verificación completa.
- 2026-09-27: cinco migraciones forward-only aplicadas en producción; lint/build y 558 pruebas E2E pasaron; deployment `dpl_BCQoEKpMnYSuK7Qren9aXtVuhWvz` está `READY`. Los errores de `db lint` restantes son referencias a tablas temporales dentro de RPCs; ver `license-per-business-progress.md` para el detalle.
