# Plan de implementación: pedidos por WhatsApp

Fecha: 2026-08-25

Estado: implementación local completada y verificada

Especificación: `docs/superpowers/specs/2026-08-25-whatsapp-orders-design.md`

Rama: `codex/whatsapp-orders`

## Resultado verificable

Un cliente autorizado debe poder ordenar por texto usando el menú real, recibir una cotización de domicilio por rango y colonia, elegir efectivo o transferencia, confirmar una sola vez y generar un pedido idempotente que continúe en Cocina, impresión, Estado, caja, inventario e Historial. El personal debe poder administrar el canal y tomar conversaciones. Los cambios de cocina deben producir los avisos aprobados.

## Límites de esta ejecución

- Implementar y verificar en local.
- Mantener `dry-run` como valor seguro por defecto.
- No aplicar migraciones al Supabase remoto.
- No desplegar a Vercel.
- No activar el número real.
- No ejecutar llamadas de Google Maps sin credenciales configuradas por el usuario.
- No leer ni mostrar secretos.

## Fase 1. Línea base y compatibilidad

1. Conservar las correcciones locales de Meta y teléfonos mexicanos.
2. Alinear tipos y pruebas con la especificación aprobada.
3. Mantener compatibilidad con conversaciones persistidas por la migración pendiente.

## Fase 2. Esquema y seguridad

1. Crear una migración adicional mediante Supabase CLI.
2. Añadir `menu_items.whatsapp_enabled`, configuración del canal, horarios, rangos de entrega, recargos por colonia, cotizaciones, despacho, eventos y campos de atención humana.
3. Proteger tablas con RLS, grants mínimos y RPCs con permisos explícitos.
4. Extender la RPC de pedidos externos para recibir una cotización validada y conservar el cobro pendiente.

## Fase 3. Motor conversacional

1. Paginación textual de cinco productos por categoría.
2. Descripción, ingredientes y precios reales.
3. Bebida sin alcohol ofrecida una sola vez.
4. Alcohol solo por solicitud explícita.
5. `Disponible en WhatsApp` independiente del POS e inventario.
6. Domicilio con dirección o ubicación, referencia y cotización.
7. Pago a domicilio solo en efectivo o transferencia.
8. Horarios configurables y transferencia humana por las reglas aprobadas.
9. Resumen completo y reconfirmación ante cambios.

## Fase 4. Entrega y Google Maps

1. Implementar adaptador de Geocoding y Routes exclusivamente en servidor.
2. Cachear domicilios confirmados.
3. Aplicar rangos y recargos configurados.
4. Transferir más de 15 km o direcciones ambiguas.
5. Degradar con seguridad cuando Google no esté configurado.

## Fase 5. Administración y atención humana

1. Organizar `/dashboard/whatsapp` en Resumen, Conversaciones, Catálogo, Entregas, Horarios, Atención humana, Bot y Diagnóstico.
2. Implementar lectura y edición mediante acciones de servidor autorizadas.
3. Permitir tomar, responder, devolver y cerrar conversaciones sin respuestas simultáneas del bot.
4. Mantener móvil y tablet como objetivos principales.

## Fase 6. Estados y mensajes automáticos

1. Enviar `En preparación` al cambio real de Cocina.
2. Enviar `Listo y buscando repartidor` al marcar listo.
3. Permitir `Repartidor en camino` desde Estado.
4. No enviar `Entregado` automáticamente.
5. Registrar entrega, lectura, error e idempotencia de cada aviso.

## Fase 7. Retención y diagnóstico

1. Conservar contenido durante 90 días.
2. Preparar limpieza segura del cuerpo manteniendo métricas anónimas.
3. No registrar contenido ni secretos en consola o Sentry.
4. Exponer errores accionables sin detalles sensibles.

## Fase 8. Verificación

1. Pruebas del motor, catálogo, tarifas, horario y deduplicación.
2. Pruebas de webhook y Meta.
3. Pruebas persistentes con `dry-run=true`.
4. `npm run lint`.
5. `npm run build`.
6. Pruebas E2E relevantes.
7. `npx supabase migration list`.
8. `npx supabase db push --linked --dry-run`.
9. `git diff --check` y revisión de secretos.

## Puertas posteriores

Requieren una nueva aprobación explícita:

1. Aplicar migraciones remotas.
2. Configurar credenciales productivas.
3. Ejecutar una prueba integral que cree pedidos reales.
4. Desplegar a Vercel.
5. Activar el número real.
