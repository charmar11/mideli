# Resiliencia del checkout conversacional de WhatsApp

## Objetivo

Evitar que respuestas interactivas antiguas interrumpan el checkout, mantener el domicilio validado durante todo el flujo y rechazar indicaciones que solo contienen etiquetas genéricas.

## Diseño aprobado

### Acciones por etapa

Los botones del carrito solo serán válidos mientras el carrito esté en edición. Los botones del resumen solo serán válidos durante la confirmación final. Si Meta entrega una respuesta antigua, el estado no cambiará y el bot repetirá la decisión vigente con sus controles actuales.

En particular, `cart:note` no podrá reemplazar `awaiting_address_confirmation`. El cliente confirmará o cambiará primero el domicilio y podrá añadir la indicación desde el resumen final.

### Domicilio canónico

Una vez confirmado el candidato de Google Maps, la respuesta de tarifa, el estado persistido, el resumen y la orden usarán `formattedAddress`. La dirección escrita por el cliente seguirá disponible únicamente como entrada de auditoría y búsqueda.

### Indicaciones válidas

El flujo guiado rechazará etiquetas sin contenido como `Nota`, `Añadir nota`, `Indicación` o `Observación`. Solo se persistirá la indicación que aporta información operativa.

### Diagnóstico

Los errores de Supabase y proveedores que sean objetos estructurados producirán un detalle sanitizado con código y mensaje. Nunca se incluirán credenciales, cuerpos remotos ni datos completos del cliente.

## Pruebas

- Botón antiguo de nota durante confirmación de domicilio conserva etapa y cotización.
- Confirmar el domicilio después del intento obsoleto continúa al pago sin recotizar.
- La tarifa usa la dirección formateada confirmada.
- Una etiqueta genérica no se guarda como indicación.
- Una indicación real se guarda una sola vez.
- Suite completa de WhatsApp, TypeScript, ESLint y build de producción.

## Despliegue

No requiere una nueva migración. La restricción de etapas ya fue ampliada en `20260827233233_extend_whatsapp_interactive_stages.sql`. El cambio se desplegará en Vercel y se verificará con el endpoint de salud y los logs de producción.
