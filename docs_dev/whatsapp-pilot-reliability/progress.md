# Progreso

## 2026-08-26

- Se revisó el contexto extendido del proyecto.
- Se diagnosticaron retrasos y procesamiento fuera de orden con evidencia de base de datos y registros.
- Se identificó que Google seleccionó un parque sin validar el número exterior.
- Se aprobó y documentó el diseño en `docs/superpowers/specs/2026-08-26-whatsapp-pilot-reliability-address-design.md`.
- Próximo paso: implementar la serialización del webhook y las pruebas asociadas.
- Se añadió una migración local con exclusión persistente por conversación y commit atómico de estado más mensaje.
- El webhook dejó de usar trabajo diferido y ahora reporta duración real del procesamiento.
- Google evalúa candidatos, exige calle y número coincidentes y rechaza parques o resultados aproximados.
- El domicilio original se conserva y los recargos pueden coincidir también con el texto del cliente.
- El efectivo avanza directamente al resumen sin preguntar cuánto entregará el cliente.
- Se agregaron reintentos cortos para fallas transitorias de Meta y registro visible de respuestas fallidas.
- La migración incluye índices para acelerar la bandeja de conversaciones y el historial seleccionado.
- Pasaron 42 pruebas específicas de conversación, operaciones y webhook.
- `npx tsc --noEmit`, `npm run lint` y `npm run build` terminaron correctamente.
- `npx supabase migration list` muestra solo la migración nueva como pendiente.
- `npx supabase db push --linked --dry-run` confirmó que únicamente se aplicaría esa migración.
- Se aplicó `20260827011009_whatsapp_conversation_processing_leases.sql` y el historial remoto quedó sincronizado.
- Vercel desplegó el commit `0006712` y actualizó el alias `https://mideli.vercel.app`.
- `GET /api/health` respondió 200 con versión `0006712a53e1`.
- El webhook respondió 403 ante un token de verificación deliberadamente inválido.
