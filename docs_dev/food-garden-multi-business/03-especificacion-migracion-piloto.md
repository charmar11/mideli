# Especificación 3: migración y piloto

**Estado:** borrador para revisión. No autoriza implementación ni cambios remotos.

## Objetivo

Convertir primero Mideli al modelo multinegocio sin cambiar sus credenciales ni el funcionamiento visible. Después de una prueba satisfactoria se incorporará Just Dipping con sus datos y autorizaciones reales.

## Punto de partida verificado

El código y Supabase actuales todavía funcionan como un solo negocio:

- Los perfiles tienen un rol global.
- El catálogo es global.
- Los pedidos no tienen una frontera de negocio.
- El inventario y las recetas son globales.
- Existe una caja global abierta.
- Los pagos y reportes no están separados por negocio.
- Las mesas son compartidas y deben seguir siéndolo.
- WhatsApp y sus configuraciones están ligados a Mideli.

Por eso la migración debe ser progresiva. No se debe resolver solamente con filtros visuales.

## Fase 0: protección

- Respaldar la base y verificar que el respaldo pueda restaurarse.
- Registrar la versión estable actual de Mideli.
- Mantener el árbol de trabajo y las migraciones existentes sin descartarlas.
- Preparar un entorno de prueba o una rama de base de datos.
- Crear una lista de pruebas de regresión del flujo actual.

## Fase 1: fundación compatible

- Crear la organización Rincón 404 Food Park.
- Crear Mideli como el primer negocio.
- Crear membresías y permisos sin reemplazar las cuentas de Auth actuales.
- Asociar todos los datos actuales de pedidos, cobros, inventario, gastos, cortes, clientes y WhatsApp a Mideli.
- Conservar credenciales, folios y nombres históricos.
- Mantener el canal de WhatsApp exclusivamente en Mideli.
- Mantener temporalmente compatibilidad con el flujo actual mientras se valida el backfill.

No se crea Just Dipping todavía y no se modifica su sistema externo.

## Fase 2: contexto sin cambio visible

- Resolver el negocio permitido desde la sesión/membresía.
- Filtrar catálogo, pedidos, historial, caja, inventario, Realtime y reportes.
- Mantener la interfaz de Mideli igual para sus usuarios.
- Verificar que todos los registros actuales sigan apareciendo exactamente donde deben.
- Ejecutar pruebas de aislamiento intentando leer datos de otro negocio.

## Fase 3: operación de mesa y caja

- Introducir la visita de mesa compartida.
- Separar un carrito mixto en cuentas hijas por negocio.
- Separar cobros y cajas por negocio.
- Mantener una vista general para la mesera con cuentas separadas.
- Probar consumos adicionales después de un pago.

## Fase 4: piloto Mideli

El piloto inicial será principalmente con Mideli, durante una semana y de preferencia de lunes a jueves. No se deben capturar ventas nuevas simultáneamente en el sistema viejo y el nuevo, salvo un procedimiento de contingencia controlado.

Se detiene el piloto si ocurre cualquiera de estos casos:

- Pedido perdido.
- Cobro incorrecto.
- Pedido enviado al negocio equivocado.
- Inventario cruzado.
- Datos de otro negocio visibles.

El tiempo máximo aceptable para que mesera y operación vean un pedido nuevo es de aproximadamente 10 segundos.

## Fase 5: incorporación de Just Dipping

Solo después de aprobar el piloto de Mideli:

- Confirmar dueño y personal de Just Dipping.
- Confirmar qué información se autoriza migrar del sistema anterior.
- Hacer exportación validada y fecha de corte.
- No conectar directamente el sistema anterior a la operación nueva.
- Crear el negocio, usuarios, menú e inventario dentro de la plataforma nueva.
- Configurar su tableta y su Estado sin pantalla de Cocina.
- Probar una mesa con productos de Mideli y Just Dipping.

La conservación del historial anterior de Just Dipping sigue siendo una decisión pendiente de autorización de sus dueños.

## Reversión

La migración debe poder desactivarse mediante una bandera o procedimiento operativo sin borrar datos. El regreso temporal al flujo anterior lo autoriza el creador del programa.

No se deben hacer cambios irreversibles hasta comprobar:

- Conteo de pedidos antes y después.
- Totales cobrados.
- Saldos pendientes.
- Inventario consumido y devuelto.
- Cortes y gastos.
- Usuarios y permisos.

## Criterios de aceptación

La primera etapa estará lista cuando:

- Mideli opere igual que antes.
- La cuenta actual conserve acceso.
- Andrea pueda operar como mesera global.
- Mauro vea únicamente Cocina de Mideli.
- La cuenta antigua `Mideli` no opere si se autoriza su desactivación.
- La caja y el historial de Mideli coincidan.
- Un pedido mixto pueda dividirse sin mezclar negocios en pruebas controladas.
- Just Dipping pueda incorporarse después sin modificar los datos históricos de Mideli.
