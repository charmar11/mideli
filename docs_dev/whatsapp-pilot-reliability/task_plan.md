# Task: Piloto confiable de pedidos por WhatsApp

## Meta

Corregir el orden y tiempo de procesamiento, impedir cotizaciones sobre domicilios dudosos, simplificar el pago y fortalecer la intervención humana sin crear órdenes reales.

## Fases

- [x] Fase 1: Diagnóstico y diseño aprobado
- [x] Fase 2: Procesamiento idempotente y ordenado
- [x] Fase 3: Validación de domicilio y tarifa
- [x] Fase 4: Flujo de pago, correcciones y handoff
- [x] Fase 5: Rendimiento y observabilidad del panel
- [x] Fase 6: Pruebas, lint, build y migraciones en seco

## Decisiones

| Decisión | Razón | Fecha |
|---|---|---|
| Mantener `create_orders_enabled=false` | El piloto no debe afectar operación real | 2026-08-26 |
| Procesar mensajes por conversación en orden | Evita estados adelantados y respuestas duplicadas | 2026-08-26 |
| Rechazar direcciones de baja confianza | Nunca cotizar sobre un parque o número incorrecto | 2026-08-26 |
| No preguntar efectivo recibido por WhatsApp | El cambio se registra al cobrar en Mideli | 2026-08-26 |

## Errores encontrados

| Error | Intento | Resolución |
|---|---:|---|
| Mensajes almacenados con 108 a 160 segundos de retraso | 1 | Pendiente: eliminar procesamiento diferido y serializar por conversación |
| Google aceptó un parque como domicilio | 1 | Pendiente: puntuar candidatos y exigir coincidencia de calle y número |
| `rg` no expandió `tests/e2e/whatsapp-*.spec.ts` en PowerShell | 1 | Buscar en el directorio y filtrar archivos con `-g` |
| TypeScript detectó una cotización obsoleta en un test previo | 1 | Actualizar el fixture al contrato actual de `ConversationDeliveryQuote` |

## Estado de entrega

La implementación está aplicada en Supabase y desplegada en Vercel. La creación de órdenes continúa desactivada para realizar el piloto conversacional sin afectar cocina, caja, impresión ni inventario.
