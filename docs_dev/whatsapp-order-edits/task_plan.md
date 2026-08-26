# Task: Pedidos editables y entrega por WhatsApp

## Goal

Implementar `docs/superpowers/specs/2026-08-26-whatsapp-order-edits-delivery-tone-design.md` sin romper pedidos existentes, con variaciones por unidad, cambios naturales, cotización operativa y mensajes más humanos.

## Phases

- [x] Phase 1: Investigar y documentar causas
- [x] Phase 2: Aprobar y documentar diseño
- [x] Phase 3: Crear pruebas de conversación que reproduzcan los errores
- [x] Phase 4: Implementar líneas configurables por unidad y resúmenes agrupados
- [x] Phase 5: Implementar modificaciones naturales y contexto de servicio
- [x] Phase 6: Mejorar cotización, recuperación y tono
- [x] Phase 7: Configurar y probar origen de entrega de forma segura
- [ ] Phase 8: Verificar pruebas, lint, build y base remota
- [ ] Phase 9: Publicar cambios y validar flujo real

## Decisions

| Decision | Rationale | Date |
|---|---|---|
| Modelo híbrido por unidad | Permite variaciones distintas sin alargar resúmenes idénticos | 2026-08-26 |
| Confirmación explícita después de cada cambio | Evita que una interpretación incorrecta llegue a Cocina | 2026-08-26 |
| Cambios posteriores reutilizan flujo auditable | No se reescriben pedidos operativos silenciosamente | 2026-08-26 |
| Google Maps conserva fallback humano | Una dirección dudosa no debe producir una tarifa falsa | 2026-08-26 |
| Emojis moderados y funcionales | Hace el bot más cálido sin saturar el chat | 2026-08-26 |

## Errors Encountered

| Error | Attempt | Resolution |
|---|---|---|
| Una cantidad de 3 compartía una sola variación | Investigación | Confirmado en estado remoto: 3 California quedaron como Res |
| No se cotizó el domicilio | Investigación | Cotización desactivada y origen del local sin coordenadas |
| ESLint no encontró `test-results` | Verificación paralela | Playwright eliminó la carpeta mientras ESLint la recorría; se ejecutó lint de nuevo en serie y pasó |
