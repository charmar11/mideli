# Directorio de clientes de WhatsApp

Fecha: 2026-08-27
Estado: aprobado

## Objetivo

Dar al propietario y al administrador una vista práctica para localizar a cualquier cliente de WhatsApp, revisar sus domicilios y consultar todos sus pedidos sin saturar la navegación principal de Mideli.

## Alcance aprobado

- Agregar `Clientes` como pestaña principal dentro de `/dashboard/whatsapp`.
- Restringir el directorio y sus acciones a roles `owner` y `admin`.
- Buscar globalmente por nombre, teléfono o folio exacto, incluso cuando el pedido no sea el más reciente.
- Mostrar un directorio resumido con número de pedidos, total pagado y última compra.
- Mostrar al seleccionar una persona: datos de contacto, domicilios guardados, indicadores comerciales, historial de pedidos y conversación más reciente.
- Permitir editar el nombre y los domicilios guardados.
- Permitir abrir directamente la conversación correspondiente desde la ficha.
- No eliminar clientes, pedidos ni domicilios en esta fase.

## Interfaz

La vista usa el patrón operativo de Mideli: lista a la izquierda y ficha contextual a la derecha. En móvil se muestra primero la lista y después la ficha, con un botón visible para regresar.

El buscador es el foco de la pantalla. Las filas muestran nombre, teléfono, última compra y un resumen económico. La ficha divide claramente contacto, domicilios e historial. Los folios, teléfonos, cantidades y dinero usan JetBrains Mono. Rosa marca selección, verde acciones útiles y ámbar asuntos pendientes.

Estados obligatorios: carga inicial, búsqueda sin resultados, cliente sin domicilios, cliente sin pedidos, error recuperable y actualización en curso.

## Datos y rendimiento

- No se agregan tablas ni columnas.
- Las acciones usan el cliente administrativo únicamente en el servidor, después de validar sesión, perfil activo y rol owner/admin.
- El directorio carga hasta 50 resultados por consulta y selecciona solo columnas necesarias.
- La búsqueda consulta nombre y teléfono; cuando recibe un número también busca un folio exacto y agrega su cliente al resultado.
- Los indicadores se calculan con pedidos reales. `Total pagado` suma únicamente el importe pagado de pedidos no cancelados.
- El detalle se carga bajo demanda y limita el historial a los 100 pedidos más recientes.
- La edición de un domicilio invalida su geocodificación anterior cuando cambia el texto para evitar reutilizar coordenadas o tarifas incorrectas.

## Seguridad e integridad

- Mesero, cocina y supervisor no ven la pestaña ni pueden ejecutar sus acciones.
- Ningún componente cliente recibe la llave de servicio.
- Actualizar un cliente no modifica pedidos históricos.
- Marcar un domicilio como predeterminado desmarca primero los demás del mismo cliente.
- Todas las entradas se recortan y tienen límites de longitud en el servidor.

## Verificación

- Pruebas de búsqueda por nombre, teléfono y folio.
- Pruebas de métricas y orden del historial.
- Pruebas de helpers de presentación y estados vacíos.
- ESLint y build de producción.
- Pruebas de WhatsApp existentes para descartar regresiones.
- Revisión responsiva en escritorio y móvil.
- Verificación posterior al deploy mediante `/api/health`, acceso protegido y logs de Vercel.

