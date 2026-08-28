# Findings

- Los únicos errores 500 recientes corresponden al constraint ya corregido por `68f5e50`; no aparecieron errores nuevos durante este recorrido.
- `handleConversationMessage` acepta `cart:note` globalmente y fuerza retorno a `ordering`, incluso si el estado real es confirmación de domicilio.
- `confirmQuoteForState` produce el estado correcto, pero `deliveryQuoteReply` recibe el estado anterior y por eso muestra la dirección escrita.
- `withDeliveryQuote` ya reemplaza `address` por `formattedAddress`; no hace falta cambiar el esquema.
- El flujo guiado acepta cualquier texto de 2 a 500 caracteres, por lo que `Nota` puede almacenarse si llega fuera de orden.
- Meta envía un contexto citado al responder botones. La repetición visual de la pregunta en el texto copiado no equivale a dos respuestas salientes.
