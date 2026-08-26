# Plan: pedidos conversacionales por WhatsApp

## Meta

Implementar el diseño aprobado en `docs/superpowers/specs/2026-08-25-whatsapp-orders-design.md` por fases seguras, empezando con simulador y webhook local en `dry-run`.

## Fases

- [x] Fase 0: Aprobar el diseño consolidado y capturar la línea base.
- [x] Fase 1: Implementar contratos, catálogo conversacional y motor puro con pruebas.
- [x] Fase 2: Implementar bandeja inicial y simulador local.
- [x] Fase 3: Implementar webhook firmado, persistencia base y adaptador Meta.
- [x] Fase 4: Alinear esquema, RLS y RPC con catálogo, horarios, entrega y atención humana.
- [x] Fase 5: Completar el motor textual de cinco productos, bebidas, domicilio y pago.
- [x] Fase 6: Implementar administración organizada, bandeja humana y controles del canal.
- [x] Fase 7: Integrar notificaciones de estados de cocina y reparto.
- [x] Fase 8: Completar pruebas, lint, build y dry-run de migraciones.
- [x] Fase 9: Preparar la prueba integral local sin desplegar ni aplicar cambios remotos.
- [x] Fase 10: Persistir el piloto en Supabase, mantener bloqueada la creación real de pedidos y mejorar voz, navegación e inbox humano.
- [x] Fase 11: Optimizar la bandeja con sincronización ligera, desplazamiento automático y acceso temporal visible.

## Decisiones

| Decisión | Motivo | Fecha |
|---|---|---|
| WhatsApp Cloud API de Meta como proveedor | Ya existe cuenta Mideli y evita un intermediario adicional | 2026-08-25 |
| Simulador y `dry-run` antes de Meta | Protege caja, inventario, impresión y datos reales | 2026-08-25 |
| Motor determinista sin LLM obligatorio | Costo cero y control estricto sobre catálogo y precios | 2026-08-25 |
| Operación externa exclusiva del servidor | El webhook no tiene sesión de personal y nunca debe confiar en el cliente | 2026-08-25 |
| Recalcular en PostgreSQL | Evita precios manipulados y conserva atomicidad | 2026-08-25 |
| Reutilizar disparadores actuales | Conserva folios, inventario e impresión | 2026-08-25 |
| No aplicar cambios remotos sin aprobación específica | El piloto debe permanecer aislado | 2026-08-25 |
| Diseño consolidado aprobado | El usuario aprobó catálogo, entrega, horarios, atención, estados, privacidad y liberación | 2026-08-25 |
| Primera entrega sin botones ni imágenes | Reduce complejidad y mantiene la conversación natural | 2026-08-25 |
| Tarifa por rangos más recargo por colonia | Coincide con la operación real del negocio | 2026-08-25 |
| Más de 15 km pasa a atención humana | Evita tarifas y cobertura incorrectas | 2026-08-25 |
| No aplicar migraciones ni desplegar en esta fase | La autorización actual cubre implementación local | 2026-08-25 |
| Persistir conversaciones durante el piloto | Vercel no garantiza memoria entre mensajes y el equipo necesita historial y respuesta manual | 2026-08-26 |
| Separar persistencia de creación de pedidos | Permite probar conversaciones reales sin afectar cocina, caja, inventario o impresión | 2026-08-26 |
| Voz breve y cercana de Mideli con emojis moderados | Hace el flujo más natural y escaneable sin fingir capacidades humanas | 2026-08-26 |
| Sincronización ligera cada 2 segundos | Evita recargar catálogo, horarios y diagnósticos mientras mantiene el chat actualizado | 2026-08-26 |
| Mantener tablas del canal privadas | La bandeja seguirá usando acciones autenticadas del servidor sin ampliar RLS | 2026-08-26 |

## Errores encontrados

| Error | Intento | Resolución |
|---|---:|---|
| Herramientas del grafo requeridas por `explore-codebase` no disponibles | 1 | Inspección dirigida con PowerShell |
| `rg.exe` devolvió acceso denegado desde el paquete de Codex | 1 | Usar `Get-ChildItem` y `Select-String` |
| Apertura directa de documentación Markdown de Supabase devolvió tipo no soportado | 1 | Consultar resultados oficiales indexados en la web |
| Primera ejecución del test del motor no encontró los módulos nuevos | 1 | Fallo esperado de TDD; implementar los módulos y repetir |
| Aserción de mensaje distinguía mayúscula inicial | 1 | Comparar el texto visible sin distinguir mayúsculas |
| ESLint detectó una variable de prueba que nunca se reasigna | 1 | Cambiar `let` por `const` |
| Primera prueba de webhook no encontró los módulos Meta | 1 | Fallo esperado de TDD; implementar firma, normalizador y proveedor |
| Codex bloqueó generar y copiar un secreto al portapapeles | 1 | Crear un asistente local que el usuario ejecuta sin exponer el token al agente |
| La comprobación HTTP del lanzador esperaba indefinidamente la página de Next | 1 | Sustituirla por una comprobación TCP del puerto |
| Playwright no pudo abrir otro servidor mientras el webhook estaba activo | 1 | Reutilizar el servidor local mediante `PLAYWRIGHT_BASE_URL` |
| Supabase local no pudo iniciar porque Docker o Podman no están instalados | 1 | Conservar la migración sin aplicar y exigir validación adicional antes del remoto |
| Turbopack siguió junctions externos dentro de `.opencode/skills` | 1 | Limitar el escaneo de Tailwind a `src` con `source(none)` y `@source` |
| `apply_patch` rechazó borrar y recrear el mismo plan en una sola operación | 1 | Dividir el reemplazo en dos operaciones separadas |
| El parche del repositorio no coincidió con el orden real de las líneas | 1 | Inspeccionar secciones exactas y aplicar cambios pequeños |
| TypeScript detectó etapas nuevas sin etiquetas en el simulador | 1 | Añadir etiquetas para catálogo, bebida, referencia, cotización y efectivo |
| Seis pruebas repetidas por dispositivo esperaban el flujo conversacional anterior | 1 | Actualizar las expectativas al diseño aprobado y añadir cobertura nueva |
| TypeScript no permitió reasignar resultados de Supabase con selecciones distintas | 1 | Separar resultado principal, datos y error del fallback compatible |
| Se intentó consultar una sesión de terminal con el mecanismo de espera equivocado | 1 | Consultar la sesión unificada con `write_stdin` hasta obtener la salida final completa |

## Puertas de seguridad

- [ ] Token nuevo de Meta guardado fuera de Git y del chat.
- [ ] `WHATSAPP_DRY_RUN=true` confirmado.
- [x] Webhook firmado y lista permitida de teléfonos.
- [x] Migración reconocida por `supabase db push --linked --dry-run`, sin aplicarse.
- [ ] Migración validada por PostgreSQL real.
- [ ] Aprobación antes de aplicar Supabase remoto.
- [ ] Aprobación antes de desplegar Vercel.
- [ ] Aprobación antes de registrar el número real.
