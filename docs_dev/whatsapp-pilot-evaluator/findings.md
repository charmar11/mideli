# Findings

- La sección `WhatsApp → Diagnóstico` ya contiene salud de Meta, Gemini, Maps y una prueba manual de domicilio.
- `requireChannelUser(true)` ya limita acciones administrativas a owner/admin.
- El banco existente cubre más de 500 mensajes y 100 conversaciones, pero usa un catálogo fijo y no se ejecuta desde Vercel.
- `quoteWhatsappDelivery` no escribe en Supabase cuando recibe `conversationId: null`.
- `processMetaWebhook`, repositorio y creador de órdenes no deben importarse desde el evaluador temporal.
- El catálogo real se carga actualmente dentro de `meta-runtime.server.ts`; se extraerá a un cargador compartido sin cambiar su consulta.
- El reporte debe contener resultados y tiempos, nunca mensajes, teléfonos, direcciones, coordenadas ni secretos.
- El listado inicial tenía 27 escenarios con un límite de 25; se eliminaron dos comprobaciones redundantes para asegurar que las dos pruebas de Maps sí se ejecuten.
- La suite completa de WhatsApp contiene 111 pruebas y pasó después de integrar el evaluador.
- El evaluador usa el catálogo real, pero crea estados únicamente en memoria. Maps recibe `conversationId: null`, por lo que no persiste cotizaciones.
- Gemini respondió HTTP 400 con la clave local y la categoría segura fue `auth`; los dos escenarios bloqueados dependen de una respuesta semántica válida.
- Google geocodificó correctamente el domicilio del local, pero Routes omitió `distanceMeters` al calcular origen y destino idénticos. Fue un defecto del escenario, no de la geocodificación operativa.
