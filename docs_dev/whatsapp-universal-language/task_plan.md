# Task: Comprensión universal y segura para WhatsApp

## Goal

Implementar el diseño aprobado en `docs/superpowers/specs/2026-08-27-whatsapp-universal-language-design.md` sin perder pedidos, inventar productos ni ejecutar instrucciones ambiguas. El lanzamiento requiere un banco de al menos 500 mensajes y 100 conversaciones completas.

## Release gates

- 100% de invariantes críticas aprobadas.
- Cero productos, precios, opciones o direcciones inventadas.
- Cero pedidos duplicados.
- Cero acciones ambiguas ejecutadas sin aclaración.
- Comprensión directa igual o superior a 98% en el corpus válido.
- Respuesta normal menor a tres segundos.
- `npm run lint`, suite completa y `npm run build` aprobados.
- Piloto en modo controlado antes de habilitar creación de órdenes.

## Phases

### Phase 0: Línea base y seguridad

- [ ] Crear checkpoint Git antes de modificar el intérprete.
- [ ] Confirmar worktree limpio y estado del deploy vigente.
- [ ] Ejecutar suite actual y guardar línea base de tiempos y resultados.
- [ ] Identificar conversaciones reales que pueden anonimizarse para pruebas.
- [ ] Confirmar que el bot puede detenerse desde configuración durante el piloto.

### Phase 1: Banco de evaluación

- [ ] Crear un DSL tipado para estados iniciales, mensajes, acciones esperadas e invariantes.
- [ ] Crear casos curados para cada etapa del pedido.
- [ ] Generar variaciones de ortografía, cortesía, regionalismos, números y orden de frases.
- [ ] Alcanzar un mínimo comprobable de 500 mensajes individuales.
- [ ] Crear 100 escenarios completos con varias vueltas de conversación.
- [ ] Crear reporte por intención, etapa, exactitud, aclaraciones y pérdidas de contexto.
- [ ] Agregar comando dedicado para ejecutar solamente la evaluación conversacional.
- [ ] Ejecutar el motor actual y registrar la línea base antes de corregirlo.

### Phase 2: Normalización de entrada

- [ ] Crear pruebas para respuestas citadas, botones obsoletos, espacios, emojis y mensajes repetidos.
- [ ] Separar texto citado de la respuesta nueva usando contexto de Meta cuando exista.
- [ ] Normalizar abreviaciones y errores frecuentes sin alterar nombres reales del menú.
- [ ] Conservar alcance de negaciones, cantidades y orden de instrucciones.
- [ ] Detectar preguntas frente a órdenes antes de buscar productos.
- [ ] Verificar que la normalización nunca transforme una consulta en una compra.

### Phase 3: Plan semántico multiacción

- [ ] Sustituir la interpretación de intención única por un plan ordenado de acciones.
- [ ] Definir acciones tipadas para catálogo, carrito, notas, servicio, pago, confirmación y ayuda.
- [ ] Extraer localmente dirección, ubicación, PIN y datos de pago antes de llamar a Gemini.
- [ ] Actualizar el esquema JSON de Gemini para devolver acciones, referencias y confianza.
- [ ] Impedir que Gemini redacte respuestas o devuelva IDs fuera del catálogo y carrito entregados.
- [ ] Validar límites de cantidad, opciones requeridas y compatibilidad con la etapa.
- [ ] Rechazar el plan completo cuando una operación crítica sea inválida.
- [ ] Aplicar acciones seguras una sola vez y conservar las ambiguas como aclaración pendiente.
- [ ] Hacer idempotente la continuación de una aclaración para no repetir acciones previas.

### Phase 4: Contexto, correcciones y cambios de opinión

- [ ] Resolver referencias como `ese`, `el otro`, `los dos`, `la segunda` y `el de pollo`.
- [ ] Procesar varias instrucciones en el orden expresado por el cliente.
- [ ] Cubrir negaciones complejas y correcciones como `no era res, era pollo`.
- [ ] Permitir cambiar de opinión en bebida, servicio, domicilio, pago y confirmación.
- [ ] Mantener carrito, dirección, tarifa y pago cuando una aclaración no los modifica.
- [ ] Mostrar un resumen breve después de cambios que afecten cantidades o total.
- [ ] Pedir solo el dato faltante y una sola pregunta por mensaje.

### Phase 5: Recuperación y atención humana

- [ ] Eliminar activaciones por palabras genéricas como `persona`.
- [ ] Hacer que `human_handoff_enabled` controle botones, transferencias y Push.
- [ ] Primer fallo: aclaración concreta.
- [ ] Segundo fallo: dos o tres opciones plausibles.
- [ ] Tercer fallo: reformular o solicitar atención humana sin perder el pedido.
- [ ] No transferir automáticamente por producto desconocido, archivo no compatible o nota ambigua.
- [ ] Mantener transferencia inmediata para errores técnicos críticos que impidan registrar el pedido.
- [ ] Probar que desactivar atención humana no deja conversaciones bloqueadas.

### Phase 6: Preguntas del negocio y seguimiento

- [ ] Responder menú, ingredientes, precios y disponibilidad con datos reales.
- [ ] Responder horario, métodos de pago, cobertura y política de envío desde configuración.
- [ ] Responder carrito, subtotal y total desde el estado vigente.
- [ ] Consultar estado por conversación o folio sin exponer pedidos ajenos.
- [ ] Redirigir temas ajenos al negocio de forma breve.
- [ ] No consultar Gemini cuando una respuesta determinista sea suficiente.

### Phase 7: Rendimiento y observabilidad

- [ ] Medir tiempo del normalizador, motor local, Gemini, validación y respuesta Meta.
- [ ] Mantener camino rápido local para botones y respuestas inequívocas.
- [ ] Conservar timeout y fallback cuando Gemini falle.
- [ ] Registrar solo intención, etapa, resultado y duración; nunca texto, teléfono, dirección o secretos.
- [ ] Crear métricas de aplicación, aclaración, fallback y transferencia.
- [ ] Verificar que el percentil operativo normal permanezca bajo tres segundos.

### Phase 8: Verificación y piloto

- [ ] Ejecutar corpus completo y generar informe final.
- [ ] Ejecutar pruebas de webhooks duplicados y mensajes consecutivos.
- [ ] Ejecutar `npm run lint`.
- [ ] Ejecutar suite completa de Playwright en escritorio, tablet y móvil.
- [ ] Ejecutar `npm run build`.
- [ ] Probar con Meta usando creación de órdenes desactivada.
- [ ] Revisar manualmente al menos 25 conversaciones representativas.
- [ ] Habilitar creación solo cuando se cumplan todos los release gates.
- [ ] Desplegar a Vercel y comprobar salud, webhook y logs.
- [ ] Crear checkpoint posterior al piloto aprobado.

## Decisions

| Decision | Rationale | Date |
|---|---|---|
| Intérprete híbrido validado | Combina lenguaje natural con control determinista | 2026-08-27 |
| Gemini nunca modifica estado directamente | Evita acciones inventadas o fuera de etapa | 2026-08-27 |
| Datos sensibles se extraen localmente | Reduce exposición y conserva seguridad | 2026-08-27 |
| Una aclaración antes de toda acción dudosa | Protege pedido, cobro y experiencia | 2026-08-27 |
| Texto, botones y ubicación en esta fase | Limita riesgo antes de voz e imágenes | 2026-08-27 |
| Evaluación obligatoria antes del deploy | La calidad debe medirse, no suponerse | 2026-08-27 |

## Errors Encountered

| Error | Attempt | Resolution |
|---|---|---|
| Ninguno todavía | 0 | Pendiente de implementación |

