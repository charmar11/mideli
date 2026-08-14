# Prueba final de notificaciones en dispositivo

## Preparación

- Usar la versión HTTPS publicada, no localhost.
- Instalar Mideli como aplicación en la pantalla de inicio cuando el dispositivo lo requiera.
- Iniciar sesión con un perfil activo.
- Conceder permiso de notificaciones cuando Mideli lo solicite.

## Cocina

1. Abrir Cocina.
2. Activar la campana de `pedidos nuevos`.
3. Activar el altavoz local y comprobar que quede verde.
4. Con Cocina visible, crear un pedido desde otro dispositivo.
5. Confirmar una sola señal local, tarjeta animada y ningún banner duplicado.
6. Cerrar o mandar Mideli a segundo plano.
7. Crear otro pedido y confirmar el Push `Nuevo pedido #...`.
8. Tocar el Push y comprobar que abre Cocina.

## Entrega

1. Abrir Mesero y activar la campana de `pedidos listos`.
2. Mandar Mideli a segundo plano.
3. Marcar un pedido como listo desde Cocina.
4. Confirmar el Push `Pedido #... listo`.
5. Tocar el Push y comprobar que abre Estado.

## Independencia

1. Pausar únicamente Entrega y dejar Cocina activa.
2. Confirmar que llega un pedido nuevo y no llega el aviso de pedido listo.
3. Invertir la configuración y repetir.
4. Iniciar sesión como propietario o supervisor y activar ambos temas.
5. Confirmar que ese dispositivo recibe ambos tipos.

## Resultado esperado

- Cada dispositivo conserva su propia configuración.
- Pausar un tema no cambia el otro.
- No aparecen banners duplicados cuando la vista responsable está abierta.
- El sistema operativo puede usar su propio tono; Mideli controla el sonido local dentro de Cocina y Mesero.
