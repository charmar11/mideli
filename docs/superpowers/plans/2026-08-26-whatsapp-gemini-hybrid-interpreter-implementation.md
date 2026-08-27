# Implementación del intérprete híbrido de WhatsApp con Gemini

Fecha: 2026-08-26

## Resultado esperado

El bot interpreta respuestas contextuales y pedidos compuestos con mayor confiabilidad. Gemini funciona solo como respaldo semántico, devuelve operaciones estructuradas y nunca controla precios, catálogo, domicilio, pago ni creación de órdenes.

## Fases

1. Auditar el flujo completo desde el webhook hasta `conversation-engine` y localizar el punto seguro para una interpretación asíncrona.
2. Crear regresiones deterministas con las conversaciones reales reportadas.
3. Corregir el contrato entre última pregunta y respuesta sin depender de Gemini.
4. Crear el adaptador de Gemini con sanitización, timeout, JSON Schema y errores tipados.
5. Validar las operaciones propuestas contra el catálogo y aplicarlas mediante funciones del dominio.
6. Consultar Gemini solo ante mensajes complejos o ambiguos dentro de `ordering`.
7. Documentar variables, mantener la función apagable y no habilitar órdenes reales.
8. Ejecutar pruebas focalizadas, suite completa pertinente, lint y build.

## Restricciones

- No cambiar el esquema remoto salvo evidencia de necesidad.
- No leer ni imprimir `GEMINI_API_KEY`.
- No enviar información personal, domicilios ni conversación completa a Gemini.
- No desplegar ni activar creación de órdenes sin autorización separada.
- Conservar `.superpowers/` y cualquier cambio ajeno.

## Criterios de terminado

- El transcript reportado termina sin producto perdido ni transferencia humana incorrecta.
- Las operaciones de Gemini se rechazan si no coinciden con catálogo y variaciones.
- Timeout, cuota, autenticación y JSON inválido degradan a aclaración local.
- Los mensajes repetidos no duplican cambios.
- `npm run lint` y `npm run build` terminan correctamente.
