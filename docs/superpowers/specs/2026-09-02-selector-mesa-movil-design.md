# Selector de mesa móvil

## Objetivo

Permitir que el mesero seleccione una mesa desde un teléfono sin perder zonas, nombres ni controles, manteniendo el plano global para tablet y computadora.

## Problema observado

El selector reutiliza el plano global con zonas posicionadas de forma absoluta dentro de un canvas vertical. En móvil el canvas recorta contenido, las zonas pueden encimarse y las mesas quedan demasiado pequeñas para distinguirlas o tocarlas. El resumen de la selección queda separado del punto de interacción.

## Dirección aprobada

- En tablet y computadora se conserva el plano global con todas las zonas.
- En móvil se muestra una zona a la vez mediante un selector de zona.
- El mapa móvil se ajusta al contenedor y muestra mesas con un área táctil mínima de 52 px.
- Se agrega una vista `Lista` como alternativa al mapa.
- La selección queda visible en una tarjeta fija con zona, mesa y capacidad.
- `Confirmar mesa` ocupa todo el ancho y permanece accesible al final.
- Las zonas y mesas fuera de los límites se ajustan visualmente sin cambiar datos automáticamente.
- Las zonas vacías y la ausencia de zonas tienen estados claros.

## Flujo

1. El mesero abre `Seleccionar mesa`.
2. En móvil ve la zona activa y puede cambiarla con chips desplazables o un selector compacto.
3. Elige una mesa en `Mapa` o `Lista`.
4. La tarjeta inferior muestra `Mesa`, `Zona` y `Capacidad`.
5. Confirma o cancela sin desplazamiento horizontal.

## Componentes y datos

- `TablePicker` controla la zona móvil, la vista activa, la mesa pendiente y el footer fijo.
- `TableFloorMap` recibe una lista filtrada de zonas en móvil y conserva todas las zonas cuando el viewport es tablet o escritorio.
- La lista móvil usa las mismas mesas y nombres que el mapa, sin duplicar reglas de selección.
- Solo se consideran zonas y mesas activas, como en la carga actual.

## Estados y accesibilidad

- Mesa pendiente seleccionada: borde y fondo de marca, con `aria-pressed`.
- Mesa no seleccionada: contraste suficiente y botón completo.
- Sin selección: `Selecciona una mesa para continuar` y botón deshabilitado.
- Sin mesas en la zona: mensaje de estado y cambio de zona disponible.
- Controles táctiles de al menos 44 px, preferentemente 52 px para mesas y acciones primarias.
- El diálogo bloquea el desbordamiento horizontal y conserva desplazamiento vertical interno.

## Fuera de alcance

- No se cambia el esquema de Supabase.
- No se modifica la administración del plano en esta entrega, salvo ajustes visuales compartidos que no alteren posiciones guardadas.
- No se cambia la regla de negocio de mesas ocupadas o cuentas acumuladas.

## Verificación

- Lint y build obligatorios.
- Pruebas de selección móvil y confirmación de mesa.
- Revisión del diff para evitar cambios en las modificaciones existentes del usuario.
