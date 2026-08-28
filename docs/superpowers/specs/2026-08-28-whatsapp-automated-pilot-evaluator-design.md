# Evaluador temporal del piloto de WhatsApp

Fecha: 2026-08-28

Estado: diseño aprobado para revisión final

## Objetivo

Permitir que propietario y administrador ejecuten desde Mideli una evaluación automática de 25 conversaciones representativas contra el motor real de WhatsApp, el catálogo vigente, Gemini y una comprobación limitada de Google Maps. La herramienta no enviará mensajes, no creará pedidos y no modificará datos operativos.

## Alcance

La herramienta vivirá temporalmente en **WhatsApp → Diagnóstico** y mostrará:

- avance de los 25 escenarios;
- cantidad aprobada y fallida;
- errores críticos y aclaraciones;
- tiempo promedio y tiempo máximo;
- estado de Gemini y Google Maps;
- detalle breve de cada escenario que no cumpla el contrato.

Solo owner y admin podrán ejecutarla.

## Enfoques considerados

### Script local

Es rápido y no afecta producción, pero no valida las variables ni el entorno real de Vercel.

### Datos sintéticos persistidos

Probaría más partes de Supabase, pero contaminaría clientes, conversaciones y métricas. Se descarta.

### Evaluador administrativo aislado

Es el enfoque seleccionado. Ejecuta el motor en memoria desde Vercel, usa configuración real y devuelve únicamente un reporte temporal al navegador.

## Arquitectura

### Interfaz temporal

Una tarjeta dentro de Diagnóstico tendrá:

- botón **Ejecutar 25 conversaciones**;
- indicador de progreso por bloques;
- resumen con resultado general;
- lista desplegable de fallos;
- aviso permanente de que no se enviarán mensajes ni se crearán pedidos.

La tarjeta se adaptará a móvil sin desplazamiento horizontal.

### Acción de servidor

Una acción exclusiva para owner/admin ejecutará un bloque de cinco escenarios. El navegador solicitará cinco bloques consecutivos y ensamblará el reporte final. Esta división evita agotar el tiempo máximo de una función de Vercel y permite mostrar avance real.

Cada llamada:

1. verifica sesión, rol y configuración segura;
2. carga el catálogo activo y la configuración actual;
3. crea conversaciones ficticias solo en memoria;
4. ejecuta el mismo motor híbrido que utiliza Meta;
5. valida invariantes y devuelve métricas sanitizadas;
6. descarta todos los estados al terminar.

No utilizará `processMetaWebhook`, repositorios de conversaciones ni el creador canónico de órdenes. De esta manera resulta imposible enviar respuestas por Meta o escribir pedidos accidentalmente.

### Escenarios

Los 25 escenarios cubrirán, como mínimo:

- saludo, menú y navegación;
- cantidades expresadas con números y palabras;
- productos con variaciones obligatorias;
- varias configuraciones del mismo producto;
- bebida aceptada y rechazada;
- cambio de opinión;
- quitar, reemplazar y corregir productos;
- notas para producto, pedido y entrega;
- recoger y domicilio;
- efectivo y transferencia;
- confirmación y modificación desde el resumen;
- texto citado de WhatsApp;
- mensaje desconocido y recuperación;
- petición explícita de atención humana;
- repetición del mismo identificador lógico sin duplicar acciones.

Los escenarios usarán IDs obtenidos del catálogo por nombres y categorías conocidas. Si un producto necesario no está disponible, el caso se reportará como **no ejecutable**, nunca se inventará un ID.

## Google Maps

Solo dos escenarios harán consultas reales:

- una dirección conocida dentro de cobertura;
- una dirección deliberadamente incompleta que debe solicitar aclaración o revisión.

La cotización se hará con `conversationId: null`, por lo que no persistirá dirección ni cotización. El reporte no incluirá la dirección completa ni coordenadas.

## Gemini

Gemini se utilizará únicamente en escenarios complejos que requieran desambiguación. El reporte conservará resultado, duración y tipo de fallo, pero nunca el mensaje completo, catálogo, teléfono, dirección o clave.

Una caída de Gemini no aprobará silenciosamente un pedido parcial. El escenario deberá terminar en respuesta segura o aclaración.

## Contratos de aprobación

Un escenario pasa solo cuando cumple todas sus invariantes aplicables:

- ningún producto, precio, opción o dirección inventados;
- ninguna operación duplicada;
- carrito y total esperados;
- etapa conversacional correcta;
- ninguna orden creada;
- ningún mensaje enviado;
- datos ambiguos no ejecutados;
- instrucciones múltiples conservadas o aclaradas de forma segura;
- respuesta normal dentro del objetivo de tres segundos, salvo las dos comprobaciones externas de Maps.

El resultado general será:

- **Aprobado:** 25 escenarios válidos y cero invariantes críticas rotas.
- **Revisar:** al menos una aclaración o dependencia externa no disponible, sin corrupción de estado.
- **Bloqueado:** producto inventado, duplicación, acción ambigua ejecutada, envío real o creación de orden.

## Seguridad y concurrencia

- Solo owner/admin.
- Una ejecución activa por navegador.
- Cinco escenarios por llamada.
- Sin teléfonos reales, mensajes reales ni datos personales.
- Sin escritura en Supabase.
- Sin llamadas al proveedor de Meta.
- Sin migraciones.
- Sin nuevas dependencias.
- Los errores visibles serán sanitizados.

## Verificación

Antes de considerar lista la herramienta:

1. pruebas unitarias del evaluador y sus invariantes;
2. prueba de permisos;
3. prueba que falle si se intenta usar un adaptador de Meta o crear una orden;
4. prueba móvil de la tarjeta y el reporte;
5. `npm run lint`;
6. suite de Playwright pertinente;
7. `npm run build`;
8. revisión del diff para secretos o datos personales.

El despliegue requerirá autorización explícita.

## Retirada obligatoria después del piloto

La herramienta se implementará en módulos aislados para poder retirarla sin afectar el bot. Cuando termine la evaluación real se eliminarán:

- la tarjeta y sus estados de interfaz;
- la acción de servidor temporal;
- el ejecutor y los escenarios temporales de `src`;
- cualquier tipo dedicado exclusivamente al reporte temporal.

No se crearán tablas, columnas, variables ni dependencias que deban limpiarse. Las pruebas permanentes del motor conversacional seguirán existiendo porque protegen la operación, pero el evaluador ejecutable no quedará incluido en Mideli.

## Ajustes posteriores a las ejecuciones reales

La primera evaluación real confirmó dos necesidades de diagnóstico:

- los escenarios de Gemini mostrarán una causa sanitizada (`autenticación`, `cuota`, `tiempo de espera`, `respuesta inválida` o `proveedor`) en lugar de un fallo genérico;
- la prueba válida de Maps utilizará un punto sintético cercano al origen configurado, no el mismo domicilio del local, porque Google puede omitir la distancia cuando origen y destino coinciden.

La prueba posterior demostró que desplazar coordenadas puede caer en un punto que Google considera de baja confianza. La comprobación válida utilizará la dirección configurada del local. Cuando Google devuelve una ruta sin `distanceMeters` y ambos puntos están a menos de 100 metros, Mideli interpreta correctamente la distancia como cero; fuera de esa proximidad conserva `route_not_found`. La dirección incompleta continúa siendo la segunda comprobación negativa.
