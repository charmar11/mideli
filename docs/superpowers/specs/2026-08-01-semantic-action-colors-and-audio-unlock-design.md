# Colores semánticos y desbloqueo de audio en Mideli

Fecha: 2026-08-01

## Objetivo

Hacer que las acciones operativas se reconozcan con rapidez en todo Mideli, sin convertir la interfaz oscura en una mezcla decorativa de colores. Al mismo tiempo, retirar el aviso amarillo innecesario de Recetas y eliminar el control flotante de sonido que invade el encabezado móvil al recargar.

## Enfoques considerados

### 1. Colores por consecuencia

Es la opción aprobada. Cada color conserva el mismo significado en todas las pantallas: completar, destruir, advertir, crear o navegar. Reduce errores porque el usuario puede anticipar la consecuencia antes de leer todo el botón.

### 2. Colores por módulo

Se descartó porque un botón verde podría significar una cosa en Inventario y otra en Cocina. El usuario tendría que reaprender los colores en cada sección.

### 3. Mantener casi todo en rosa

Se descartó porque creación, cobro, eliminación y navegación compiten con la misma jerarquía. La marca permanece visible, pero deja de ayudar a distinguir consecuencias.

## Semántica aprobada

- Rosa Mideli: navegación activa, selección, creación y siguiente paso de marca.
- Verde: cobrar, cobrar y enviar, enviar, entregar, marcar como listo, guardar y confirmar una operación positiva.
- Rojo: eliminar, borrar, vaciar, anular, desactivar permanentemente y confirmar una acción destructiva.
- Naranja: dejar pendiente, pausar, registrar una merma o ejecutar una acción que necesita atención especial.
- Neutral: cancelar, cerrar, volver, editar, consultar, actualizar y acciones sin consecuencia irreversible.

El color no será el único indicador. Cada botón conservará un verbo específico, un icono cuando ya exista y estados claros de foco, carga y desactivación. Los botones de navegación y filtros no cambiarán de color por el verbo de su etiqueta.

## Aplicación técnica

El componente compartido `Button` incorporará variantes semánticas sólidas para éxito, advertencia y destrucción. Las variantes reutilizarán los tokens existentes `success`, `warning`, `destructive` y `brand`; no se añadirán colores arbitrarios.

La aplicación se concentrará en acciones con consecuencias claras dentro de:

- Punto de venta y carrito.
- Estado, Historial y flujo de cobro.
- Cocina.
- Menú y productos.
- Personal y permisos.
- Mesas y zonas.
- Inventario, compras, conteos, movimientos y recetas.

Los controles secundarios permanecerán neutrales. Los cambios serán visuales y no modificarán permisos, consultas, estados de pedido ni transacciones.

## Recetas

Se eliminará por completo el aviso amarillo `Primero registra un insumo`. La ausencia de insumos seguirá representada por los estados vacíos y los controles desactivados existentes, sin repetir un mensaje que ocupa espacio y domina la pantalla.

## Desbloqueo de sonido

### Causa confirmada

`ReadyOrderNotifier` muestra un botón con posición fija, alineado a la esquina superior derecha y con una capa superior al encabezado. Después de recargar, el navegador todavía no permite reproducir audio y el botón aparece hasta la primera interacción. En móvil coincide con el nombre de usuario y los controles del encabezado.

### Solución aprobada

- El botón flotante `Activar sonido` dejará de renderizarse.
- El primer toque o pulsación de teclado seguirá intentando desbloquear el archivo de audio silenciosamente.
- Si llega un pedido listo y el navegador todavía bloquea la reproducción, se mostrará un aviso temporal y accionable.
- No se reservará espacio permanente en el encabezado y no aparecerá texto superpuesto durante la recarga.
- El control de sonido propio de Cocina conservará su lugar dentro de la barra de herramientas de Cocina.

## Accesibilidad y respuesta táctil

- Las acciones principales mantendrán al menos 44 px de altura en superficies táctiles.
- El texto blanco sobre verde, rojo, naranja o rosa deberá conservar contraste suficiente.
- Todos los botones tendrán foco visible y estado desactivado legible.
- El color acompañará al texto y al icono, nunca los sustituirá.
- Las acciones destructivas mantendrán confirmación cuando el daño no sea recuperable.

## Validación

- Prueba automatizada que confirme que `Activar sonido` no se renderiza después de recargar en móvil.
- Prueba del desbloqueo de audio tras la primera interacción.
- Revisión visual conjunta en móvil y escritorio de POS, Cocina, Inventario, Recetas, Menú, Personal y Mesas.
- Comprobación de estados hover, focus, disabled y loading en variantes semánticas.
- Verificación de que el aviso amarillo de Recetas desapareció.
- Ejecución de ESLint y build de producción.

## Fuera de alcance

- Cambiar la identidad oscura de Mideli.
- Recolorear gráficas, estados informativos o categorías sin una consecuencia operativa.
- Cambiar sonidos, lógica de notificaciones push o comportamiento de Supabase Realtime.
- Modificar textos operativos que no sean el aviso amarillo indicado.
