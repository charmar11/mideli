# Decisiones de producto y arquitectura

Este archivo resume decisiones que no deben revertirse por accidente al modificar una interfaz o un flujo.

## Alcance

Mideli opera un solo local Burger & Sushi. No agregar abstracciones multi-tenant, multisucursal o marketplace sin una decisión explícita de producto.

## Orden de servicio

El pedido se arma primero y después se elige el contexto de servicio. Para comedor se selecciona mesa en el plano; para domicilio se confirma el punto; para llevar no se pide información innecesaria.

## WhatsApp

- El bot debe saludar con personalidad, emojis y categorías legibles, pero las opciones interactivas deben coincidir exactamente con el texto mostrado.
- `Hablar con alguien` no aparece al inicio. Se ofrece cuando el cliente lo solicita o cuando el bot ya no puede resolver la indicación.
- Las variaciones y extras deben mostrar claramente qué opción incrementa el precio y cuánto incrementa.
- El teléfono identifica principalmente al cliente; el nombre es opcional.
- Un relevo humano conserva carrito, datos del cliente, dirección, notas y método de pago.
- La creación automática queda controlada por una bandera técnica y una configuración visible en WhatsApp.

## Domicilios

- Se prefiere capturar calle, número y colonia para geocodificar, con corrección mediante mapa.
- Las direcciones repetidas del mismo cliente se unifican usando el resultado canónico de Maps.
- El usuario puede editar o eliminar domicilios desde el directorio autorizado.
- El envío se calcula y se muestra al cliente, pero un repartidor externo cobra la tarifa por separado. El cobro operativo de Mideli es el subtotal de productos.
- Las coordenadas, distancia y dirección de la orden se guardan como snapshot para historial y seguimiento.

## Pagos y caja

El pago no reemplaza el estado de preparación. Una orden puede estar en cocina aunque todavía no esté pagada. Las correcciones, divisiones, descuentos y cierres deben quedar auditados en el libro mayor y no resolverse con escrituras legacy.

## Interfaz móvil

- Las acciones de enviar, cobrar, confirmar y entregar deben ser grandes, accesibles y visibles.
- Cada vista debe tener un scroll principal claro. Los paneles que sí necesitan desplazamiento propio deben capturar el gesto vertical sin desplazar la pantalla completa.
- El color comunica estado además del texto: rosa para selección/acción de marca, verde para completar, ámbar para atención, rojo para acciones irreversibles y dorado para valor.
- No ocultar nombres de categorías en escritorio si eso dificulta reconocer el menú.

## Notificaciones

Las notificaciones Push se configuran por dispositivo y por tema. El aviso debe ser idempotente. Si Cocina o Mesero ya están visibles, puede preferirse sonido o señal local para no duplicar banners.

Los avisos de WhatsApp al cliente se mantienen desactivados por defecto en pedidos manuales y solo se envían con consentimiento aplicable.

## Datos y seguridad

- El service role de Supabase, claves de Meta, Gemini, Maps, licencia y Sentry nunca llegan a Client Components.
- Las migraciones son la única vía para cambios de esquema.
- Los datos conversacionales pueden limpiarse mediante la operación autorizada sin borrar órdenes, folios ni auditoría.
- El número de teléfono se normaliza internamente para búsquedas y proveedores, pero la interfaz muestra el formato local cómodo cuando es posible.
