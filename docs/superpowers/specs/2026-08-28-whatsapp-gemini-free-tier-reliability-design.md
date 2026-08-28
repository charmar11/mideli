# Confiabilidad de Gemini en el nivel gratuito

Fecha: 2026-08-28

Estado: aprobado

## Objetivo

Mantener la interpretación semántica de pedidos de WhatsApp sin contratar otro proveedor y sin depender del límite de 20 solicitudes diarias de Gemini 2.5 Flash-Lite.

## Decisión

Mideli usará `gemini-3.1-flash-lite` como modelo predeterminado. El proyecto conserva `WHATSAPP_GEMINI_MODEL` como anulación explícita para poder cambiar de modelo sin modificar código.

Este modelo se selecciona porque el proyecto de Google AI Studio muestra una cuota gratuita de 15 solicitudes por minuto y 500 solicitudes diarias, y porque admite salidas estructuradas. El intérprete local seguirá siendo la primera ruta; Gemini se invocará únicamente cuando una instrucción sea compleja, ambigua o no haya podido resolverse localmente.

## Errores y reintentos

El adaptador de Gemini convertirá la respuesta del proveedor en categorías sanitizadas:

- credencial inválida o sin permisos;
- cuota o frecuencia agotada;
- modelo inexistente o no disponible;
- solicitud o esquema incompatibles;
- tiempo de espera;
- fallo temporal del proveedor;
- respuesta inválida.

No se mostrará el cuerpo de la respuesta, la clave, el mensaje del cliente ni el catálogo.

Solo los errores temporales se reintentarán una vez: límite por minuto, timeout de red y respuestas `5xx`. El reintento tendrá una espera corta y respetará un presupuesto total cercano al objetivo conversacional de tres segundos. Los errores `400`, `401`, `403` y `404` no se reintentarán.

Si Gemini no está disponible, Mideli conservará el comportamiento seguro actual: utilizar el resultado local cuando esté completo o pedir una aclaración sin modificar parcialmente el pedido.

La verificación real de producción detectó que el endpoint de `gemini-3.1-flash-lite` rechaza el esquema cuando contiene `maxItems`, `minimum` o `maximum`, aunque acepta el mismo esquema sin esas restricciones. Mideli no enviará esos tres atributos a Google. Los límites de confianza, acciones, cantidad y opciones seguirán aplicándose después de recibir la respuesta y antes de modificar el carrito.

## Evaluador temporal

El evaluador ya ejecuta cinco bloques consecutivos y cada escenario de un bloque en serie. Se conservará este comportamiento porque evita ráfagas innecesarias. No se añadirá una cola global ni persistencia nueva.

El reporte distinguirá cuota, credencial, modelo, solicitud incompatible, timeout y proveedor. Google Maps seguirá siendo una dependencia separada y nunca se atribuirá un fallo de domicilio a Gemini.

## Verificación

- prueba del modelo predeterminado y de la anulación por variable;
- prueba de clasificación segura de errores de credencial, cuota, modelo y solicitud;
- prueba de un único reintento para `429` y `5xx`;
- prueba de ausencia de reintento para `400` y `403`;
- pruebas del evaluador temporal;
- suite del lenguaje de WhatsApp;
- `npm run lint`;
- `npm run build`;
- revisión del diff para confirmar que no contiene secretos.

## Fuera de alcance

- cambiar la clave de Gemini;
- crear otro proyecto para evadir cuotas;
- habilitar facturación;
- modificar Google Maps;
- alterar pedidos, base de datos o el flujo de Meta;
- desplegar sin autorización explícita.
