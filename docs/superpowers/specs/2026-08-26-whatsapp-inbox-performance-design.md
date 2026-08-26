# Bandeja rápida de WhatsApp

Fecha: 2026-08-26

## Objetivo

Mostrar conversaciones y mensajes nuevos en un máximo aproximado de dos segundos, sin recargar el centro completo de WhatsApp ni interrumpir el chat seleccionado.

## Problema confirmado

La bandeja ejecuta `router.refresh()` cada diez segundos. Esto vuelve a consultar conversaciones, catálogo, horarios, tarifas, diagnósticos y configuración. Después, el chat seleccionado solicita otra vez sus mensajes. El costo y el reemplazo completo de propiedades hacen que la interfaz se perciba lenta.

## Diseño aprobado

- Eliminar el refresco completo periódico.
- Crear una acción autenticada y ligera que entregue únicamente conversaciones y los mensajes del chat seleccionado.
- Consultar esa acción cada dos segundos solo mientras la pestaña de conversaciones esté abierta y el documento sea visible.
- Evitar solicitudes superpuestas y conservar el contenido previo si una actualización falla.
- Actualizar el chat inmediatamente al cambiar de conversación o después de una acción manual.
- Desplazar el historial al final al abrir una conversación y cuando aparezcan mensajes nuevos.
- Mantener el botón de actualización general para cambios administrativos.
- Ejecutar en paralelo la carga inicial del control y del catálogo.
- Reactivar temporalmente el acceso de WhatsApp para propietario, administrador, mesero y supervisor.

## Seguridad y datos

La lectura seguirá pasando por acciones del servidor con validación de sesión y rol. No se abrirán las tablas privadas al cliente, no se modificarán políticas RLS y no se expondrá la clave de servicio.

## Verificación

- Lint y build de producción.
- Confirmar que la navegación muestra WhatsApp para los roles autorizados.
- Confirmar que el sondeo no ejecuta `router.refresh()`.
- Confirmar que una conversación mantiene su selección y que el historial baja al mensaje más reciente.
- Desplegar en Vercel y comprobar `/api/health`.
