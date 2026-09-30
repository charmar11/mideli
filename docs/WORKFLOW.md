# Cómo trabajamos en Rincón 404

Este es el acuerdo práctico entre el dueño y quien desarrolla el sistema. El
dueño describe lo que necesita en español normal. El agente investiga, decide
los detalles técnicos y entrega una forma sencilla de comprobar el resultado.
No hace falta aprender a programar ni llenar formularios.

## 1. Contar la necesidad

Una petición puede ser tan simple como: «En la cuenta de Andrea, al abrir caja
de Mideli no aparece el botón, aunque tiene permiso». Si es un fallo, ayudan
una captura, el negocio, el dispositivo, la hora, el folio y los pasos para
repetirlo. Si es una función nueva, ayuda explicar quién la usará y qué debe
pasar al final. El agente preguntará solo por decisiones de negocio que no se
puedan deducir; hará las preguntas de una en una cuando haga falta.

## 2. Entender antes de cambiar

El agente identifica el comportamiento esperado en una frase y comprueba el
recorrido completo: pantalla, permisos, acciones del servidor, base de datos y
avisos. Lee `AGENTS.md`, el contexto extendido y el código afectado; consulta
el estado remoto cuando una afirmación dependa de producción. Revisa el estado
de Git para conservar trabajo anterior. Una captura es evidencia, no una orden
de copiar su diseño ni de alterar datos.

Si el dueño dice «continúa», el agente toma el siguiente pendiente comprobable
del piloto y del contexto vigente, explica cuál eligió y avanza. No pide al
dueño que traduzca la tarea a archivos o términos técnicos.

En un problema urgente, primero identifica la causa y un camino seguro para
que el local continúe operando. Después corrige la causa y la regresión.

## 3. Acordar el resultado

Para cambios pequeños basta definir un caso concreto que debe funcionar. Para
cambios grandes, el agente presenta un plan breve con comportamiento, límites,
riesgos y cómo se comprobará. Resuelve decisiones técnicas con criterio propio;
solicita al dueño únicamente las decisiones que cambian la operación, los
datos reales o los costos.

Ejemplo de criterio: «Andrea puede abrir la caja de Mideli aunque tenga abierto
el menú de Just Dipping. La caja de Just Dipping no aparece si no tiene ese
permiso». Esto permite comprobar el resultado sin leer código.

## 4. Construir en partes revisables

Se implementa el cambio completo más pequeño que resuelve la necesidad. Se
reutilizan patrones existentes, se conservan los cambios de otras tareas y no
se mueve código operativo solo para mejorar la apariencia de las carpetas.
Cuando cambia la base de datos, se crea una migración nueva, se revisa su
alcance y se verifica antes de aplicarla. Los permisos por negocio se validan
en servidor y base; ocultar un botón no basta.

Cada entrega debe poder rastrearse a un conjunto concreto de cambios y
pruebas. Si la carpeta tiene trabajo sin commit, se separa y revisa antes de
publicar; no se agregan todos los archivos por comodidad. Para un cambio
grande se usa una rama o un espacio de trabajo aislado cuando haga falta.

## 5. Probar antes de entregar

Para cambios de código siempre se ejecutan `npm run lint` y `npm run build`.
Además se prueba el caso corregido y el caso contrario que podría romperse.
Según el impacto se añaden pruebas Playwright de escritorio, tablet y móvil,
pruebas SQL y comprobaciones remotas. En pedidos y cobros se revisa que cada
negocio conserve sus propios datos, caja, folios y autorizaciones.

Push, WhatsApp, impresora, PWA y cobros en turno requieren una prueba con los
dispositivos o cuentas reales cuando esa integración sea parte de la entrega.
Una prueba automatizada aprobada no se presenta como prueba física realizada.

## 6. Publicar y comprobar

Cuando el cambio debe llegar al local, el agente identifica la versión exacta,
revisa migraciones y publica en el entorno autorizado siguiendo
[Operación](OPERATIONS.md). Confirma el estado del deploy y explica qué parte
se pudo comprobar en producción. Si la prueba necesita un empleado, impresora
o cliente real, entrega pasos cortos para que el dueño pueda confirmarla.
Después se conserva el identificador de despliegue y se reconcilia la versión
publicada con GitHub para que otra IA pueda reproducirla.

Los cambios solo de documentación no requieren deploy de la aplicación.
Un error de producción se registra con síntoma, alcance y resultado de la
corrección para poder rastrearlo después.

## 7. Cerrar con una respuesta útil

Cada entrega al dueño responde cuatro cosas:

1. Qué cambió y para quién.
2. Qué se probó y qué resultado dio.
3. Si ya está publicado y dónde.
4. Qué comprobación práctica falta, si existe.

El agente actualiza la documentación vigente cuando cambie una regla o un
flujo. Las notas con fecha en `docs_dev/` y `docs/superpowers/` conservan el
historial; se consultan como evidencia y se cotejan con el código.

## Prioridad de estabilización

Antes de ampliar funciones, completar el [piloto real](releases/v0.9-piloto.md):
acceso de cada rol, pedido, preparación, entrega, cobro, corte, impresión,
notificaciones y recuperación ante errores. Después, cerrar respaldos y
restauración, monitoreo y un plan de contingencia sin internet. Los tickets
históricos de Just Dipping son una migración separada de las ventas actuales.
