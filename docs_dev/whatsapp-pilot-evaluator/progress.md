# Progress

## 2026-08-28

- Diseño aprobado y documentado en `docs/superpowers/specs/2026-08-28-whatsapp-automated-pilot-evaluator-design.md`.
- Repositorio limpio al iniciar.
- Arquitectura existente revisada: diagnóstico, acciones, motor, catálogo, operaciones y pruebas.
- Siguiente paso: crear contratos y escenarios del evaluador antes del ejecutor.
- Se agregaron 25 escenarios en cinco bloques: navegación, carrito, modificaciones, notas, cierre, entrega, confirmación, Gemini y Maps.
- Se extrajo la carga del catálogo a un servicio compartido sin cambiar la consulta usada por el webhook.
- Se agregó una acción restringida a owner/admin y una tarjeta temporal en `WhatsApp → Diagnóstico` con progreso, métricas y detalle de resultados.
- La prueba del evaluador pasó 2/2, la suite de WhatsApp pasó 111/111 y el build de producción terminó correctamente.
- Lint completo y segundo build de producción aprobados. La revisión confirmó que el evaluador no importa Meta, repositorio de mensajes ni creador de órdenes.
- Entrega local terminada y lista para checkpoint. No se desplegará sin autorización nueva.
- Primera ejecución en producción: 22 correctos, 1 revisión, 2 fallos críticos.
- Causas aisladas: credencial de Gemini rechazada y ruta sintética de Maps con origen igual al destino.
- Usuario autorizó corregir, verificar y preparar la actualización segura de la clave.
- Maps sintético verificado contra Google: geocodificación OK, ruta OK y 1,253 metros.
- Diagnóstico sanitizado agregado para autenticación, cuota, timeout, proveedor e interpretación insegura.
- Verificación: 113/113 pruebas de WhatsApp, lint y build aprobados; después se añadió una regresión de autenticación y el archivo terminó 5/5 con lint aprobado.
