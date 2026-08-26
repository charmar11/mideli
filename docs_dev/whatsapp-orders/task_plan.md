# Plan: pedidos conversacionales por WhatsApp

## Meta

Implementar el diseño aprobado en `docs/superpowers/specs/2026-08-25-whatsapp-orders-design.md` por fases seguras, empezando con simulador y webhook local en `dry-run`.

## Fases

- [x] Fase 0: Aprobar diseño, revisar contexto y capturar línea base.
- [ ] Fase 1: Implementar contratos, catálogo conversacional y motor puro con pruebas.
- [ ] Fase 2: Implementar bandeja y simulador local sin escrituras.
- [ ] Fase 3: Implementar webhook firmado y adaptador Meta para número de prueba.
- [ ] Fase 4: Diseñar y validar migración transaccional, RLS y repositorios.
- [ ] Fase 5: Persistir conversaciones y habilitar atención humana.
- [ ] Fase 6: Completar domicilio, estados, despacho y recuperación.
- [ ] Fase 7: Verificar y preparar liberación por puertas independientes.

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

## Errores encontrados

| Error | Intento | Resolución |
|---|---:|---|
| Herramientas del grafo requeridas por `explore-codebase` no disponibles | 1 | Inspección dirigida con PowerShell |
| `rg.exe` devolvió acceso denegado desde el paquete de Codex | 1 | Usar `Get-ChildItem` y `Select-String` |
| Apertura directa de documentación Markdown de Supabase devolvió tipo no soportado | 1 | Consultar resultados oficiales indexados en la web |

## Puertas de seguridad

- [ ] Token nuevo de Meta guardado fuera de Git y del chat.
- [ ] `WHATSAPP_DRY_RUN=true` confirmado.
- [ ] Webhook firmado y lista permitida de teléfonos.
- [ ] Migración revisada con dry-run.
- [ ] Aprobación antes de aplicar Supabase remoto.
- [ ] Aprobación antes de desplegar Vercel.
- [ ] Aprobación antes de registrar el número real.
