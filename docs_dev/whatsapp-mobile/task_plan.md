# Tarea: mejorar la central móvil de WhatsApp

## Objetivo

Eliminar el desplazamiento horizontal y hacer cómodas la bandeja, el chat y la pestaña Clientes en teléfonos, conservando la operación de escritorio.

## Fases

- [x] Fase 1: revisar contexto, implementación y sistema visual
- [x] Fase 2: definir y aprobar el diseño móvil
- [x] Fase 3: implementar navegación y layouts responsivos
- [x] Fase 4: verificar visualmente móvil y escritorio
- [x] Fase 5: ejecutar lint, build y revisar el diff
- [ ] Fase 6: crear checkpoint y desplegar a Vercel

## Decisiones

| Decisión | Motivo | Fecha |
|---|---|---|
| Una sola vista operativa por vez en móvil | Evita paneles comprimidos y mantiene el foco | 2026-08-27 |
| Navegación principal sin carrusel horizontal | Todas las secciones importantes deben ser visibles | 2026-08-27 |
| No tocar backend ni datos | El alcance es de comodidad y responsividad | 2026-08-27 |
| Conservar el sistema visual actual | Ya está aprobado y documentado | 2026-08-27 |

## Errores encontrados

| Error | Intento | Resolución |
|---|---|---|
| La ruta temporal bajo `__visual` devolvió 404 | 1 | Usar una ruta temporal normal y retirarla después de la prueba |
| El entorno bloqueó el borrado automático de capturas binarias | 1 | Mantenerlas fuera del índice de Git y excluirlas del commit y despliegue |
