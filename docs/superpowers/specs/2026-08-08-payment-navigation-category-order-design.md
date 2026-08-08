# Corrección de pagos, navegación agrupada y orden de categorías

Fecha: 2026-08-08

## Objetivo

Mejorar tres flujos administrativos de Mideli sin aumentar el ruido visual ni debilitar el control financiero:

1. Permitir corregir el método de pago desde Historial.
2. Agrupar la navegación administrativa sin agregar una segunda barra.
3. Permitir ordenar categorías mediante arrastre para definir su posición en Menú y en el POS.

La solución conserva el diseño oscuro de Mideli, prioriza tablet y celular, y mantiene objetivos táctiles de al menos 44 px.

## Alcance

### Incluido

- Acción visible para corregir el método de pago desde el detalle de un pedido.
- Corrección directa para propietario y administrador.
- Corrección para mesero mediante PIN de propietario o administrador.
- Soporte para pagos simples y combinados.
- Motivo obligatorio y auditoría completa.
- Registro explícito cuando una corrección afecta un turno ya cerrado.
- Navegación operativa fija y dos grupos administrativos.
- Variante compacta para móvil.
- Reordenamiento táctil y accesible de categorías.
- Guardado transaccional del orden completo.
- Actualización inmediata del store local y recuperación ante errores.

### No incluido

- Cambiar montos, propinas o descuentos desde Historial.
- Editar o reabrir un corte cerrado.
- Reordenar productos dentro de cada categoría.
- Cambiar permisos generales de los roles fuera de estas acciones.

## Enfoques considerados

### Parche mínimo

Exponer el icono existente de corrección, actualizar cada categoría por separado y ocultar algunos enlaces del encabezado.

Ventaja: menos código inicial.

Desventajas: la corrección seguiría siendo difícil de descubrir, el orden podría quedar parcialmente guardado y la navegación no tendría una estructura consistente entre tamaños de pantalla.

### Flujo robusto integrado

Usar una acción claramente etiquetada, reutilizar el sistema seguro de PIN administrativo, guardar el orden completo en una sola transacción y agrupar la navegación de forma responsiva.

Ventajas: operación clara, auditoría completa, seguridad consistente y ausencia de estados parciales.

Desventaja: requiere una migración y cambios coordinados en varios componentes.

Este es el enfoque aprobado.

### Centro administrativo separado

Crear páginas nuevas para correcciones financieras y ordenamiento del catálogo.

Ventaja: separación máxima.

Desventajas: agrega navegación y pasos innecesarios para acciones breves que pertenecen naturalmente a Historial y Menú.

## Corrección del método de pago

### Punto de entrada

El detalle del pedido en Historial mostrará una sección de pago con el método actual y una acción visible llamada `Corregir método`.

La acción reemplaza la dependencia del pequeño icono de lápiz dentro de la lista de tickets. La lista de tickets seguirá permitiendo seleccionar el cobro correcto cuando el pedido tenga más de una transacción.

### Selección del cobro

- Un pedido con una sola transacción completada abrirá directamente el editor.
- Un pedido con varias transacciones mostrará primero una lista con folio, fecha, monto y método.
- Un pago combinado mostrará cada entrega por separado para elegir cuál se corrige.
- Solo se podrán corregir transacciones completadas.
- Los pagos anulados permanecerán únicamente como referencia histórica.

### Permisos

- Propietario y administrador pueden ejecutar la corrección directamente.
- Mesero puede iniciar la corrección, pero debe seleccionar un propietario o administrador activo e ingresar su PIN de cuatro dígitos.
- Cocina y supervisor no reciben este permiso en esta entrega.
- El PIN nunca se almacena ni se expone al cliente después de validarse.
- Se conserva el bloqueo temporal por intentos incorrectos.

### Autorización del mesero

La autorización se realizará en dos operaciones transaccionales:

1. Una función pública valida el PIN y crea un token breve, de un solo uso, ligado al mesero, al autorizador y al pago específico.
2. La función de corrección consume ese token al cambiar el método.

Esto permite persistir correctamente los intentos fallidos y evita que un token se reutilice en otro pago.

### Datos de auditoría

`payment_tender_method_changes` conservará:

- Transacción y entrega modificada.
- Método anterior y método nuevo.
- Valores anteriores y nuevos de efectivo recibido y cambio.
- Motivo.
- Usuario que inició la corrección.
- Propietario o administrador que la autorizó.
- Fecha y hora.

Los registros existentes se conservarán y tomarán como autorizador al mismo usuario que realizó la corrección.

### Turnos abiertos y cerrados

Si el pago pertenece al turno abierto, los totales operativos se recalcularán normalmente desde las entregas actuales.

Si pertenece a un turno cerrado:

- No se reescribirán los totales ni el conteo original del corte.
- Se actualizarán el método del pago, el pedido y el snapshot del ticket.
- Se registrará una reclasificación auditable en los ajustes del corte, disminuyendo el método anterior y aumentando el nuevo por el mismo monto.
- La corrección mostrará una advertencia antes de confirmar.

Así se conserva el corte original y queda explicada la diferencia contable posterior.

### Validaciones

- Motivo entre 4 y 300 caracteres.
- Método nuevo distinto al actual.
- Transacción completada.
- Perfil activo.
- Token vigente, sin usar y ligado al pago cuando el solicitante sea mesero.
- Bloqueo de filas durante la corrección para evitar cambios simultáneos.

### Resultado visual

El diálogo mostrará:

- Folio y monto.
- Método actual.
- Selector de entrega si el pago es combinado.
- Tres opciones grandes: Efectivo, Tarjeta y Transferencia.
- Motivo obligatorio.
- Paso de autorización con selector de administrador y PIN solo para mesero.
- Resumen final antes de confirmar.

Al completarse, Historial, el ticket y el método visible se actualizarán sin recargar toda la página.

## Navegación agrupada

### Estructura aprobada

Accesos operativos visibles según el rol:

- Mesero.
- Cocina.
- Analíticas.

Grupo `Administrar`:

- Menú.
- Personal.
- Mesas.

Grupo `Control`:

- Inventario.
- Caja.
- Impresión.

Los grupos administrativos solo aparecen para propietario y administrador.

### Tablet

La barra superior mantiene una sola fila:

- Marca Mideli.
- Accesos operativos disponibles.
- Botones `Administrar` y `Control`.
- Ayuda y salida.

Cada grupo abre un menú compacto con icono, nombre y una descripción breve. El grupo se marca como activo cuando la ruta actual pertenece a uno de sus elementos. El menú se cierra al seleccionar, tocar fuera o presionar Escape.

### Móvil

La navegación inferior muestra los accesos operativos disponibles y un botón `Más` para propietario o administrador. `Más` abre una hoja inferior con los grupos Administrar y Control.

Los roles sin funciones administrativas no ven un botón vacío ni enlaces no autorizados.

### Escritorio amplio

La barra lateral conserva los accesos operativos y muestra Administrar y Control como grupos plegables. El grupo de la ruta actual se abre automáticamente.

### Accesibilidad

- Navegación completa con teclado.
- Estado activo mediante color y `aria-current`.
- Botones con nombres accesibles.
- Foco visible.
- Área táctil mínima de 44 px.

## Orden de categorías

### Interacción

Cada categoría tendrá un asa de arrastre visible en escritorio, tablet y celular.

Durante el arrastre:

- La tarjeta activa se eleva visualmente.
- La lista muestra claramente la posición de destino.
- El contenido puede desplazarse automáticamente cerca de los bordes.
- El arrastre solo inicia desde el asa para no interferir con editar, activar o eliminar.

Al soltar, el cambio se guarda automáticamente. No se agrega un botón adicional de guardar.

### Accesibilidad y alternativas

- El asa se puede enfocar con teclado.
- Las categorías se pueden mover con controles de teclado anunciando la nueva posición.
- La interacción táctil exige un movimiento mínimo para reducir arrastres accidentales.
- Mientras una categoría se edita, su arrastre queda deshabilitado.

### Persistencia

Una nueva función PostgreSQL recibirá el arreglo completo de UUID en el orden deseado.

La función:

1. Verifica que el usuario activo sea propietario o administrador.
2. Bloquea el conjunto de categorías durante la operación.
3. Comprueba que no haya UUID repetidos, faltantes o desconocidos.
4. Actualiza todos los valores `sort_order` mediante ordinalidad dentro de la misma transacción.
5. Actualiza `updated_at`.

La función privada no será ejecutable por clientes. Solo se expondrá un wrapper público con permiso para usuarios autenticados y validación interna de rol.

### Estado del cliente

El store aplicará el orden nuevo de forma optimista:

- La interfaz responde inmediatamente.
- Si la operación termina correctamente, el orden local se conserva.
- Si falla, se restaura la copia anterior y se muestra un mensaje claro.
- Menú y POS consumen el mismo arreglo ordenado, por lo que el cambio se refleja al navegar entre ambos.
- Otros dispositivos obtienen el orden nuevo en la siguiente carga del catálogo.

## Migración de base de datos

La migración incluirá:

- Tabla privada de autorizaciones breves para correcciones de método.
- Campo `authorized_by` en la auditoría de cambios, con respaldo de datos existentes.
- Nueva firma transaccional para corregir el método con autorización opcional.
- Registro de reclasificación para turnos cerrados.
- RPC transaccional para reordenar categorías.
- Revocación explícita de funciones privadas.
- Permisos mínimos para wrappers públicos.

Antes de aplicarla se ejecutará un dry run contra el proyecto enlazado.

## Manejo de errores

- PIN incorrecto: mensaje claro, campo limpio e intento persistido.
- PIN bloqueado: mostrar tiempo de espera sin cerrar el diálogo.
- Pago modificado simultáneamente: recargar sus datos y pedir nueva confirmación.
- Categorías modificadas en otro dispositivo: restaurar y volver a cargar la lista.
- Pérdida de conexión: conservar la pantalla abierta y permitir reintentar.
- Falta de permisos: ocultar las acciones y rechazar también desde PostgreSQL.

## Verificación

### Corrección de pago

- Propietario corrige efectivo a tarjeta.
- Administrador corrige tarjeta a transferencia.
- Mesero corrige mediante PIN válido.
- Mesero falla con PIN incorrecto y se persiste el intento.
- Mesero no puede reutilizar el token.
- Cocina y supervisor reciben rechazo del servidor.
- Pago combinado corrige solo la entrega seleccionada.
- Ticket y pedido muestran el método actualizado.
- Corrección en turno cerrado crea la reclasificación sin cambiar el corte original.

### Navegación

- Cada rol solo ve rutas permitidas.
- Tablet mantiene una sola fila sin desplazamiento innecesario.
- El grupo activo queda destacado.
- Menús funcionan con toque, mouse y teclado.
- Móvil abre y cierra correctamente la hoja `Más`.

### Categorías

- Arrastre con mouse.
- Arrastre táctil.
- Reordenamiento con teclado.
- Guardado automático.
- Restauración ante error.
- Orden idéntico en Menú y POS.
- Rechazo de arreglos incompletos, duplicados o enviados por roles no autorizados.

### Comandos obligatorios

```bash
npm run lint
npm run build
npx supabase migration list
npx supabase db push --linked --dry-run
```

Después de aplicar la migración se verificarán las funciones con consultas controladas y se revisarán los asesores de seguridad y rendimiento de Supabase.
