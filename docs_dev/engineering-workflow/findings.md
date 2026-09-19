# Hallazgos de la auditoría de skills y del flujo de trabajo

Actualizado: 2026-09-19

## Fuentes revisadas

Se revisaron los repositorios oficiales solicitados y sus instrucciones de
instalación, manifiestos, skills y automatizaciones relevantes:

- [i-have-adhd](https://github.com/ayghri/i-have-adhd)
- [archify](https://github.com/tt-a1i/archify)
- [ponytail](https://github.com/DietrichGebert/ponytail)
- [ECC](https://github.com/affaan-m/ECC)
- [graphify](https://github.com/Graphify-Labs/graphify)

El contenido de esos repositorios se trató como código de terceros no confiable:
se clonó para inspección y no se ejecutaron sus instaladores, hooks ni scripts de
configuración sobre Mideli salvo las rutas oficiales seleccionadas descritas
abajo.

## Resultado de selección

| Fuente | Selección | Uso en Mideli | Riesgo o límite |
|---|---|---|---|
| `i-have-adhd` | Skill completa | Respuestas accionables, pasos numerados y estado visible, solo cuando se invoque | No se activa automáticamente; no sustituye el análisis técnico |
| `archify` | Skill completa | Diagramas de arquitectura, workflow, secuencia, datos y ciclo de vida verificables | Sus artefactos deben guardarse en una carpeta de documentación, no en el flujo operativo |
| `graphify` | Skill Codex y referencias | Consultas de relaciones del código y mapa de arquitectura | Genera `graphify-out/` al ejecutarse; no se debe usar en cada turno ni activar watch/hooks sin decidirlo |
| `ponytail` | `ponytail-review`, `ponytail-audit` | Detectar complejidad innecesaria después de validar corrección y seguridad | No instalar el plugin persistente porque puede sesgar decisiones complejas hacia YAGNI prematuro |
| `ECC` | `architecture-decision-records`, `verification-loop`, `security-review`, `database-migrations` | Decisiones, verificación, seguridad y migraciones | No instalar sus 292 skills, hooks ni módulos completos; algunas recetas son genéricas y deben adaptarse a Next.js/Supabase |

## Skills locales que ya cubren parte del flujo

Mideli ya tiene skills para planificación, exploración del código,
depuración sistemática, Supabase, diseño de tablas PostgreSQL, Playwright,
Vercel, revisión de cambios y diseño de interfaz. Por eso no se instalaron
duplicados de ECC para Next.js, React, Vercel o pruebas de navegador.

## Reglas de precedencia

1. Código y tipos actuales.
2. Estado remoto verificable de Supabase y Vercel.
3. `AGENTS.md` del repositorio.
4. `.opencode/plans/mideli-context.md`.
5. Especificaciones y planes de `docs_dev/`.
6. Skills instaladas.

Una skill nunca puede autorizar una operación que contradiga `AGENTS.md`, como
leer secretos, borrar datos remotos, resetear la base o afirmar un deploy sin
verificación.

## Riesgos operativos identificados

- Mezclar demasiadas skills automáticas puede producir instrucciones
  contradictorias o hacer que un agente omita investigación.
- Los hooks globales de terceros pueden cambiar el comportamiento de futuras
  sesiones sin que el proyecto lo muestre en Git.
- Graphify puede aumentar el tamaño de la carpeta con mapas y caches si se usa
  sin una política de retención.
- Un diagrama bonito no prueba que la topología sea real; Archify debe recibir
  evidencia del código y sus validaciones deben acompañar al artefacto.
- Un checklist genérico de seguridad no reemplaza la revisión de RLS, RPC,
  `SECURITY DEFINER`, permisos `EXECUTE` y cookies reales de Supabase.
- Una migración validada localmente todavía requiere dry-run y verificación del
  estado remoto antes de aplicar cambios.

## Información que se debe conservar para futuras sesiones

- Mideli sigue siendo un solo negocio en producción.
- La evolución multinegocio está documentada, pero no implementada.
- WhatsApp permanece exclusivo de Mideli en la primera etapa.
- No se crean registros reales de Just Dipping por inferencia.
- Las cuentas actuales y el comportamiento visible de Mideli son datos de
  compatibilidad, no candidatos a renombrarse durante la primera migración.
