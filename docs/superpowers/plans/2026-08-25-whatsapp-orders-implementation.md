# Plan de implementación: pedidos por WhatsApp

Fecha: 2026-08-25
Especificación: `docs/superpowers/specs/2026-08-25-whatsapp-orders-design.md`
Rama: `codex/whatsapp-orders`

## Objetivo verificable

Un cliente de prueba debe poder escribir naturalmente por WhatsApp, recibir respuestas basadas únicamente en el catálogo vigente, construir y confirmar un carrito sin duplicados y entregar el pedido al flujo actual de Mideli. Antes de habilitar escrituras reales, el mismo recorrido debe funcionar en un simulador local y en modo `dry-run`, sin afectar caja, inventario, impresión ni analíticas.

## Reglas de seguridad

- No usar ni conservar tokens expuestos en capturas o conversación.
- No leer, imprimir o modificar valores existentes de `.env.local`.
- No desplegar a Vercel ni registrar el número real durante el desarrollo local.
- No aplicar migraciones al Supabase remoto sin una aprobación específica.
- No aceptar precios, totales, productos o variaciones calculados por el cliente o el bot.
- Verificar la firma de Meta antes de procesar cualquier evento.
- Responder de forma idempotente a reintentos y mensajes duplicados.
- Mantener `WHATSAPP_DRY_RUN=true` hasta aprobar una prueba controlada.

## Fases

### Fase 1. Contratos, configuración y motor puro

1. Añadir las variables de WhatsApp a `.env.example`, sin valores reales.
2. Crear `src/lib/whatsapp/types.ts` con mensajes normalizados, carrito, conversación, resultados y puertos de proveedor y repositorio.
3. Crear utilidades puras para normalizar texto, cantidades, teléfonos, alias y respuestas.
4. Crear un índice del catálogo que acepte solamente productos activos y sus variaciones reales.
5. Implementar un motor conversacional determinista que:
   - agregue, quite y cambie cantidades;
   - solicite únicamente variaciones requeridas o datos faltantes;
   - preserve notas y contexto;
   - detecte ambigüedad y transfiera después de dos intentos;
   - no invente precios ni productos;
   - requiera confirmación explícita antes de solicitar creación.
6. Cubrir el motor con pruebas de Playwright que importen módulos TypeScript directamente.

### Fase 2. Simulador local y modo `dry-run`

1. Crear una bandeja en `/dashboard/whatsapp`, disponible según rol y protegida por `src/proxy.ts`.
2. Añadir navegación `WhatsApp` para owner, admin, supervisor y waiter en `dashboard-shell.tsx`.
3. Mostrar un simulador solo fuera de producción para conversar contra el catálogo vigente.
4. Mantener las conversaciones simuladas aisladas en memoria local y claramente marcadas como prueba.
5. Mostrar carrito, faltantes, interpretación, transferencia y resumen final.
6. En `dry-run`, devolver una vista previa de pedido sin llamar la operación de creación ni disparar notificaciones.

### Fase 3. Adaptador Meta y webhook local

1. Crear `src/lib/whatsapp/meta-provider.ts` para enviar mensajes mediante Graph API desde servidor.
2. Crear `src/lib/whatsapp/meta-signature.ts` para validar `X-Hub-Signature-256` sobre el cuerpo crudo con comparación de tiempo constante.
3. Crear `src/app/api/integraciones/whatsapp/meta/route.ts` con:
   - GET para el reto de verificación;
   - POST firmado;
   - normalización de mensajes y estados;
   - respuesta rápida y errores sin contenido sensible.
4. Rechazar el procesamiento si la integración está desactivada, falta configuración o el teléfono no está en la lista permitida del piloto.
5. Ejecutar localhost y abrir un túnel HTTPS temporal.
6. Entregar al usuario la URL de devolución y generar un token de verificación local, sin usar el token de acceso como verificador.
7. Configurar únicamente el número de prueba y la suscripción `messages`.

### Fase 4. Persistencia y operación transaccional

1. Crear una nueva migración, posterior a `20260814030217_correct_opening_float.sql`, mediante el flujo imperativo del repositorio.
2. Añadir tablas con RLS y privilegios explícitos:
   - `customers`;
   - `customer_addresses`;
   - `channel_conversations`;
   - `channel_messages`;
   - `menu_sale_pauses`.
3. Añadir a `orders` campos de origen, conversación, teléfono, domicilio histórico, referencia, costo de envío e identificador externo.
4. Crear índices únicos para proveedor e identificador externo, evitando mensajes y pedidos duplicados.
5. Crear una RPC exclusiva de `service_role` para pedidos externos que, dentro de una transacción:
   - compruebe turno abierto;
   - valide productos activos;
   - valide grupos requeridos, selección múltiple y opciones;
   - aplique pausas temporales;
   - recalculе precios, extras, envío y total desde PostgreSQL;
   - inserte pedido e items con origen `whatsapp`;
   - reutilice folio, inventario e impresión mediante los disparadores existentes.
6. Revocar acceso de `PUBLIC`, `anon` y `authenticated` a la operación externa; conceder únicamente a `service_role`.
7. Añadir repositorios de servidor con `createAdminClient`, sin exponer la clave de servicio al navegador.
8. Revisar RLS, grants, funciones `SECURITY DEFINER` y asesores antes de cualquier aplicación remota.

### Fase 5. Bandeja del personal y atención humana

1. Sustituir el estado temporal del simulador por conversaciones persistidas.
2. Mostrar estados Nuevas, Esperando al cliente, Requieren atención, Confirmadas y Abandonadas.
3. Permitir que personal autorizado tome una conversación, responda, edite el carrito y la devuelva al bot.
4. Implementar actualización mediante Realtime con sondeo de respaldo y deduplicación.
5. Mantener Cocina fuera de la administración de conversaciones.
6. Auditar responsable y cambios importantes sin guardar secretos ni contenido innecesario en logs.

### Fase 6. Domicilio, seguimiento operativo y recuperación

1. Guardar y reutilizar domicilios confirmados por teléfono.
2. Aceptar ubicación compartida o dirección escrita y producir un enlace universal de Google Maps.
3. Añadir costo de envío, método de pago, cambio requerido y referencia al resumen.
4. Incorporar estados recibido, en preparación, listo, enviado y entregado.
5. Añadir `Compartir con repartidor` mediante la hoja de compartir del dispositivo.
6. Enviar cambios útiles al cliente y un solo recordatorio permitido para carrito abandonado.
7. Añadir una sola venta adicional contextual, nunca seleccionada automáticamente.

### Fase 7. Pruebas y puertas de liberación

1. Probar normalización, alias, errores ortográficos, cantidades, variaciones requeridas y múltiples.
2. Probar edición, cancelación, ambigüedad, transferencia y conservación del carrito.
3. Probar firma inválida, token de verificación incorrecto, teléfono no permitido y duplicados.
4. Probar precios manipulados, ausencia de turno, pausas y fallos parciales.
5. Verificar que `dry-run` no crea filas, no descuenta inventario, no imprime y no altera analíticas.
6. Ejecutar `npm run test:e2e`, `npm run lint` y `npm run build`.
7. Ejecutar `npx supabase migration list` y `npx supabase db push --linked --dry-run` si existe una migración.
8. Revisar `git diff --check`, secretos, rutas y permisos.
9. Solicitar aprobaciones independientes para migración remota, variables de Vercel, despliegue y número real.

## Archivos previstos

- `src/lib/whatsapp/*`
- `src/app/api/integraciones/whatsapp/meta/route.ts`
- `src/app/dashboard/whatsapp/page.tsx`
- `src/components/whatsapp/*`
- `src/components/dashboard/dashboard-shell.tsx`
- `src/proxy.ts`
- `src/types/database.ts`
- `.env.example`
- `tests/e2e/whatsapp-conversation.spec.ts`
- `tests/e2e/whatsapp-webhook.spec.ts`
- `supabase/migrations/<nueva_migracion_whatsapp>.sql`

## Criterio de avance inmediato

La primera entrega termina al completar las fases 1 a 3: simulador funcional, webhook verificable y prueba con el número de Meta, siempre con `dry-run`. Ninguna escritura comercial o migración remota forma parte de esa entrega.
