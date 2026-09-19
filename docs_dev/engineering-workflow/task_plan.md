# Flujo de trabajo profesional para Mideli

## Objetivo

Establecer una forma repetible de trabajar con agentes de IA sobre Mideli para
mejorar comprensión, velocidad y calidad sin sacrificar seguridad, regresión de
Mideli, trazabilidad ni capacidad de escalar a Rincón 404 Food Park.

Esta fase es de proceso y documentación. No autoriza cambios funcionales,
migraciones, datos reales ni despliegues.

## Fases

- [x] Fase 1: Auditar las cinco fuentes solicitadas y sus mecanismos de instalación.
- [x] Fase 2: Seleccionar skills compatibles sin instalar plugins globales con hooks.
- [x] Fase 3: Instalar y verificar las skills seleccionadas en Codex.
- [x] Fase 4: Diseñar el flujo de trabajo y sus gates de calidad.
- [~] Fase 5: Aplicar el flujo a la auditoría de preparación multinegocio.
- [ ] Fase 6: Revisar el flujo después del primer ciclo real y ajustarlo con evidencia.

## Decisiones

| Decisión | Motivo | Fecha |
|---|---|---|
| Instalar skills selectivas, no los paquetes completos | Evitar duplicación, hooks inesperados y reglas que compitan entre sí | 2026-09-19 |
| Mantener Archify y Graphify bajo demanda | Aportan evidencia arquitectónica sin obligar a generar artefactos en cada turno | 2026-09-19 |
| No instalar el plugin completo de Ponytail | Su modo persistente puede favorecer simplificaciones prematuras en seguridad y multinegocio | 2026-09-19 |
| No instalar el ECC completo | Incluye cientos de skills, hooks y módulos fuera del alcance actual | 2026-09-19 |
| No crear ADR automáticamente | La skill exige aprobación explícita antes de crear `docs/adr/` | 2026-09-19 |
| Mideli es el caso de regresión obligatorio | El primer objetivo multinegocio es conservar su funcionamiento visible | 2026-09-19 |
| La primera rebanada será fundación en staging, no un selector de negocio | El límite de seguridad debe existir antes de cambiar la interfaz | 2026-09-19 |

## Errores y advertencias

| Hallazgo | Tratamiento |
|---|---|
| La primera lectura de la skill de instalación se truncó por salida larga | Se volvió a leer completa antes de instalar |
| `uv` informó que `C:\Users\XPERT\.local\bin` no está en `PATH` | Se verificó Graphify usando su ruta absoluta; no se alteró el PATH del sistema |
| El repositorio Mideli ya tenía cambios sin commit | Se conservaron y se comprobó que la instalación global no agregó cambios al repositorio |
| El primer directorio temporal de Graphify no existía | Se creó una carpeta temporal existente y se ejecutó el análisis fuera del repositorio |
| El asesor remoto de seguridad reportó hallazgos | Se mantienen 36 hallazgos como gate de endurecimiento; no se aplicaron cambios remotos |

## Criterio de cierre de esta fase

- Las skills seleccionadas están instaladas y verificadas.
- Existe un flujo escrito con fases, responsables, evidencia y rollback.
- No hay cambios funcionales hechos como parte de esta tarea.
- El siguiente trabajo puede comenzar con un alcance y un gate explícitos.
- La auditoría inicial del modelo multinegocio está documentada en
  `docs_dev/food-garden-multi-business/11-auditoria-de-preparacion.md`.
