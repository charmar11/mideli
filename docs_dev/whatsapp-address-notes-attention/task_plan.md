# Tarea: domicilio confirmado, notas y atención Push

## Objetivo

Implementar el diseño aprobado en `docs/superpowers/specs/2026-08-27-whatsapp-address-notes-attention-design.md` sin alterar el flujo comercial existente de WhatsApp.

## Fases

- [x] Fase 1: Revisar contexto, diseño y estado del repositorio.
- [x] Fase 2: Diseñar la migración y comprobarla con Supabase en seco.
- [x] Fase 3: Implementar ubicación candidata y confirmación del cliente.
- [x] Fase 4: Implementar notas naturales y persistencia por destino.
- [x] Fase 5: Implementar el tema Push para atención humana.
- [x] Fase 6: Integrar interfaz, enlaces y privacidad de datos.
- [x] Fase 7: Ejecutar pruebas de flujo, lint, build y revisión de cambios.
- [x] Fase 8: Aplicar migración y desplegar cuando las verificaciones locales pasen.

## Decisiones

| Decisión | Razón | Fecha |
|---|---|---|
| Confirmar toda dirección nueva escrita | Evita cobrar o entregar sobre un punto incorrecto | 2026-08-27 |
| Omitir confirmación adicional para ubicación compartida | La acción del cliente ya confirma coordenadas precisas | 2026-08-27 |
| Reutilizar sin fricción solo domicilios previamente confirmados | Mantiene seguridad sin saturar a clientes recurrentes | 2026-08-27 |
| Guardar notas según producto, pedido o entrega | Evita exponer PIN en Cocina y conserva instrucciones útiles | 2026-08-27 |
| Push de atención desactivado inicialmente por dispositivo | Evita avisos fuera del turno | 2026-08-27 |

## Errores encontrados

| Error | Intento | Resolución |
|---|---:|---|
| Expresión `rg` mal escapada en PowerShell | 1 | Se repitió con patrones `-e` separados |
| Glob de Windows pasado literalmente a `rg` | 1 | Se limitó la búsqueda al archivo concreto y se confirmó el control requerido |
| Parche de imports no encontró el contexto exacto | 1 | Se leyó el encabezado y se aplicó un parche más pequeño |
| Fixtures desactualizados y frase afirmativa no reconocida | 1 | Se actualizaron contratos de prueba y se amplió la confirmación natural |
| Deno no está instalado localmente | 1 | El empaquetado se validó al desplegar la Edge Function con la API de Supabase |

## Criterios de terminación

- La migración pasa `npx supabase db push --linked --dry-run`.
- Los flujos nuevos tienen cobertura automatizada o un arnés reproducible.
- `npm run lint` y `npm run build` pasan.
- El diff no contiene secretos ni cambios ajenos.
- La base remota y el despliegue solo se modifican después de validar localmente.
