# Flujo de trabajo Mideli

Este es el procedimiento base para trabajar con el dueño y con agentes de IA.
Está diseñado para que el proyecto avance rápido sin convertir cada petición
en un cambio difícil de revisar o de revertir.

## 1. Entrada de una petición

Cada petición nueva se convierte en una ficha con cinco datos:

1. **Resultado visible**: qué debe poder hacer una persona del equipo.
2. **Superficies afectadas**: UI, Server Actions, RPC, RLS, Realtime, Push,
   WhatsApp, inventario, caja o reportes.
3. **No objetivos**: qué no se va a cambiar en esta entrega.
4. **Criterios de aceptación**: casos concretos que deben funcionar.
5. **Riesgo y reversión**: qué datos o turnos podría afectar y cómo se vuelve
   al estado anterior.

Si la petición llega con capturas, se separa lo que la imagen muestra de lo que
la persona está solicitando. Una captura es evidencia de una observación, no una
instrucción para copiar el diseño ni una autorización para cambiar datos.

## 2. Comprensión antes de modificar

Antes de editar:

1. Leer `AGENTS.md`, `.opencode/plans/mideli-context.md` y el plan específico.
2. Revisar `git status --short` y separar cambios existentes de los nuevos.
3. Seguir el flujo completo: entrada, estado local, Server Action o RPC,
   Supabase, triggers, Realtime/Push y pantalla que lo consume.
4. Buscar todos los consumidores de la función o tipo que se va a tocar.
5. Consultar Graphify solo para preguntas de arquitectura o cambios grandes.
   No se genera un mapa completo por costumbre ni se activa watch.

El resultado de esta fase debe ser un mapa pequeño de archivos, datos y riesgos.
Si todavía no se puede explicar dónde nace el dato y dónde termina, no se edita.

## 3. Diseño y decisión

Para cambios que atraviesen más de una capa se redacta una especificación
breve en `docs_dev/` con:

- comportamiento actual comprobado;
- comportamiento deseado;
- alternativa mínima y alternativas descartadas;
- contrato de datos y permisos;
- estados y errores;
- pruebas y criterio de rollback.

Se usa Archify cuando una imagen de arquitectura, secuencia, flujo, datos o
ciclo de vida reduce ambigüedad. El diagrama debe derivarse del código o de la
especificación aprobada, validarse y guardarse como evidencia. Un diagrama no
reemplaza pruebas.

Si se toma una decisión arquitectónica relevante, se prepara un borrador de
ADR. La carpeta `docs/adr/` solo se crea y el ADR solo se escribe después de
aprobación explícita del dueño, conforme a la skill de ADR.

## 4. Implementación por cortes pequeños

El orden recomendado es:

1. Contrato o tipo compartido.
2. Migración nueva si cambia la base.
3. RPC, Server Action o guard de autorización.
4. Lógica de dominio y manejo de errores.
5. UI y estados de carga, éxito y error.
6. Prueba dirigida del caso y de su regresión más cercana.

Reglas obligatorias:

- Reutilizar helpers y patrones existentes antes de agregar dependencias.
- No editar migraciones ya aplicadas. En Supabase, cada cambio vive en una
  migración nueva y se revisa con `npx supabase db push --linked --dry-run`.
- No confiar en filtros de la interfaz para aislamiento o permisos.
- No pasar totales, precios o `business_id` del navegador como fuente de verdad
  en operaciones sensibles; el servidor debe recalcular y autorizar.
- Las simplificaciones de Ponytail se aplican después de entender el flujo y
  nunca eliminan validación, auditoría, accesibilidad o manejo de errores.

## 5. Verificación antes de decir “listo”

La verificación se adapta al alcance, pero para cambios de código debe incluir:

1. `npm run lint`.
2. `npm run build`.
3. Pruebas dirigidas y regresión del flujo afectado.
4. `git diff --check` y revisión del diff sin archivos no relacionados.
5. Si aplica, pruebas reales con Playwright en escritorio, tablet y móvil.
6. Si toca Supabase, dry-run de migración, revisión de RLS/RPC y verificación
   de que el estado remoto coincide con lo esperado.

La skill `verification-loop` es una lista de control, no permiso para ejecutar
comandos genéricos que lean `.env.local` o expongan secretos. Los escaneos de
seguridad deben excluir secretos y usar los patrones seguros del repositorio.

Antes de un deploy se documenta:

- commit o estado exacto que se publicará;
- migraciones aplicadas o pendientes;
- smoke test de `https://mideli.vercel.app/api/health`;
- prueba de login y del flujo afectado;
- resultado de logs y errores relevantes;
- punto de rollback.

No se afirma que algo está desplegado solo porque un comando terminó: se revisa
la URL pública y el comportamiento del flujo.

## 6. Revisión de seguridad y simplicidad

Después de que la funcionalidad funciona, y antes del deploy:

- `security-review` revisa Auth, RLS, RPC, entrada de usuario, secretos,
  errores, rate limits y proveedores externos.
- `ponytail-review` revisa el diff para eliminar complejidad innecesaria sin
  cambiar el contrato.
- `ponytail-audit` se usa en sesiones separadas para deuda o bloat del repo,
  nunca como excusa para borrar historial, pruebas o migraciones.

El orden importa: primero corrección y seguridad, después simplificación.

## 7. Gates específicos para multinegocio

No se habilita un segundo negocio hasta que todos estos gates pasen:

1. Mideli conserva login, folios, menú, WhatsApp, cocina, caja, historial,
   inventario y permisos visibles.
2. Cada tabla, trigger y RPC tiene alcance clasificado como sede, negocio,
   canal, usuario/dispositivo o auditoría.
3. RLS, `SECURITY DEFINER` y permisos `EXECUTE` están probados con usuario
   local, mesera global, Coordinador, dueño de otro negocio y usuario anónimo.
4. Un pedido mixto se divide por negocio sin mezclar líneas, inventario, cocina,
   caja, pagos ni notificaciones.
5. Pausar o retirar un negocio detiene nuevas ventas sin borrar su historial.
6. WhatsApp sigue asignado explícitamente a Mideli y no carga un catálogo global.
7. Existe respaldo, conteo antes/después, fecha de corte y rollback probado.

Just Dipping no recibe registros reales ni se conecta al flujo nuevo hasta que
el dueño confirme datos, historial, fecha de corte y reglas operativas.

## 8. Formato de cierre para cada entrega

Cada entrega debe terminar con este resumen:

```text
Resultado: [qué funciona]
Archivos: [qué se cambió]
Datos: [migraciones, RLS o Supabase; si no aplica, indicarlo]
Verificación: [comandos y resultado]
Riesgos pendientes: [máximo cinco]
Deploy: [no realizado / URL verificada]
Siguiente paso: [una sola acción]
```

## 9. Cómo usaremos las skills

| Momento | Skill |
|---|---|
| Respuesta muy accionable | `$i-have-adhd` cuando se solicite |
| Investigación estructural del código | `graphify` y `explore-codebase` |
| Diseño visual o de arquitectura | `archify`, `interface-design`, `frontend-design` |
| Plan persistente | `planning` |
| Decisión relevante | `architecture-decision-records`, con aprobación antes de escribir ADR |
| Auth, RLS, datos sensibles o APIs | `security-review` y `supabase` |
| Esquema, funciones o backfills | `database-migrations`, `postgresql-table-design` y `supabase` |
| Verificación final | `verification-loop`, `playwright`, `review-changes` |
| Deploy | `vercel-deploy` y verificación pública |

La instalación de una skill no significa que se use en todos los turnos. Se
invoca por el tipo de trabajo para mantener el contexto pequeño y evitar reglas
contradictorias.
