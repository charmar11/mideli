# Mideli: notificaciones por tema, Cocina resiliente y cierre de caja claro

## Objetivo

Hacer confiables los avisos operativos de Mideli sin saturar al personal, evitar que Cocina quede atrapada cargando y mostrar con claridad cuánto efectivo inició el turno durante el corte.

El resultado debe permitir que cada usuario active en cada dispositivo los avisos que necesita, distinguir un pedido nuevo de uno listo y seguir operando cuando Realtime o una consulta de Supabase tengan una interrupción temporal.

## Alcance aprobado

Esta fase incluye:

- avisos Push independientes para pedidos nuevos de Cocina y pedidos listos para entregar;
- preferencias por usuario, dispositivo y tipo de aviso;
- controles visibles dentro de Cocina y Mesero, disponibles según las pantallas a las que accede cada perfil;
- recepción para propietario, administrador y supervisor cuando activen uno o ambos tipos;
- aviso local con sonido y señal visual cuando la pantalla correspondiente está abierta;
- Push del sistema cuando la aplicación está en segundo plano, cerrada o abierta en otra sección;
- recuperación de carga y reconexión de Cocina sin ciclos infinitos;
- desglose del fondo inicial y la fórmula del efectivo esperado en el cierre de caja.

No incluye un centro histórico de notificaciones, mensajes por WhatsApp o SMS, notificaciones de inventario ni sonidos personalizados del sistema operativo.

## Investigación y causas encontradas

### Preferencias mezcladas

La implementación actual usa un solo estado `is_active` y una sola clave local para todos los avisos del dispositivo. El control solo aparece en Mesero y su texto está ligado a pedidos listos. Esto impide activar Cocina sin activar Entrega y no ofrece control operativo a propietario, administrador o supervisor desde Cocina.

La lectura del estado remoto también trata un error de consulta como si el aviso estuviera habilitado. La pausa actual actualiza por endpoint, pero no comprueba que realmente se haya modificado una suscripción. Por eso la interfaz puede mostrar un estado distinto al guardado en Supabase.

### Nuevos pedidos sin Push

La función de servidor existente solo envía el evento de pedido listo. Cocina depende del sonido local y de Realtime, por lo que no puede recibir un aviso del sistema cuando la PWA está cerrada o en segundo plano.

### Sonido local bloqueado

Cocina inicia visualmente con sonido activo, pero el navegador puede impedir reproducir audio hasta recibir una interacción del usuario. El estado visible puede decir activo aunque el audio todavía no esté desbloqueado.

### Carga infinita en Cocina

La carga de pedidos comparte una promesa global para deduplicar solicitudes. Si Supabase no resuelve una consulta, esa promesa no termina, `loading` permanece activo y los siguientes intentos reutilizan la misma solicitud colgada. Además, ante un error se borran pedidos que ya estaban visibles y la reconexión usa reintentos constantes sin una pausa progresiva.

### Fondo inicial oculto en el corte

El turno sí guarda `opening_float` y el cálculo remoto ya lo incluye en el efectivo esperado. El modal de cierre solo presenta contado, esperado y diferencia, por lo que el dueño no puede comprobar de un vistazo con cuánto abrió la caja.

## Alternativas consideradas

### A. Preferencias por tema y dispositivo, recomendada

Cada suscripción conserva dos preferencias: `kitchen_alerts` y `ready_alerts`. El usuario decide qué recibe en cada dispositivo. La aplicación usa aviso local cuando la vista correspondiente está visible y Push cuando no lo está.

Ventajas: control preciso, evita ruido fuera del trabajo, permite que propietario y supervisor reciban ambos eventos y mantiene una sola suscripción Web Push por dispositivo.

Costo: requiere una migración aditiva, actualizar la función de envío y separar la interfaz de configuración.

### B. Un interruptor global por dispositivo

Mantendría el modelo actual y enviaría todos los eventos a cualquier suscripción activa.

Ventaja: cambio pequeño.

Desventajas: no permite elegir entre Cocina y Entrega, aumenta avisos innecesarios y no satisface la solicitud del dueño.

### C. Avisos automáticos según el rol

Mesero recibiría pedidos listos, Cocina pedidos nuevos y los perfiles administrativos recibirían ambos sin configuración.

Ventaja: casi no requiere decisiones en la interfaz.

Desventajas: el personal no puede pausar un dispositivo fuera del turno y un supervisor no puede elegir qué actividad vigilar.

Se implementará la alternativa A.

## Experiencia de usuario

### Tipos de aviso

1. **Nuevos pedidos para Cocina**
   - Título: `Nuevo pedido #<folio>`.
   - Resumen: tipo de servicio, zona y mesa cuando corresponda, y cantidad de artículos.
   - Destino: `/dashboard/cocina`.
   - Identidad visual: color ámbar y símbolo de Cocina.

2. **Pedidos listos para entregar**
   - Título: `Pedido #<folio> listo`.
   - Resumen: zona y mesa o tipo de servicio.
   - Destino: `/dashboard/mesero?mode=status`.
   - Identidad visual: color verde y símbolo de pedido listo.

### Controles

- Cocina tendrá un control compacto llamado `Avisos de pedidos nuevos`.
- Mesero tendrá un control compacto llamado `Avisos de pedidos listos`.
- Propietario, administrador y supervisor podrán acceder a ambas vistas y activar ambos avisos.
- Mesero y Cocina verán el control de la vista que su rol pueda abrir.
- El servidor aceptará preferencias de cualquier perfil activo; la navegación existente sigue determinando qué controles puede utilizar cada perfil.
- Activar o pausar un aviso solo cambia el dispositivo actual.
- La interfaz distinguirá `activo`, `pausado`, `sin permiso`, `requiere instalación`, `no compatible` y `error de conexión`.
- Un error remoto nunca se mostrará como configuración exitosa.

### Aplicación visible o en segundo plano

- Si Cocina está visible al entrar un pedido, se reproduce una vez el sonido local y la tarjeta nueva recibe una animación perceptible. No se muestra otro banner del sistema para ese mismo evento.
- Si Mesero está visible al marcar un pedido como listo, se usa el aviso local existente con sonido y señal visual. No se duplica con un banner del sistema.
- Si la aplicación está cerrada, en segundo plano o abierta en otra sección, el service worker muestra el Push.
- Tocar el Push abre el destino correspondiente y reutiliza una ventana existente cuando sea posible.

En plataformas que exigen instalar la PWA o conceder permisos, Mideli mostrará instrucciones genéricas usando la palabra `dispositivo`. El tono del Push del sistema depende del sistema operativo y no puede garantizarse desde la aplicación.

## Modelo de datos y seguridad

Se agregan a `public.push_subscriptions`:

- `ready_alerts boolean not null default false`;
- `kitchen_alerts boolean not null default false`.

La migración copiará el estado existente a `ready_alerts` para no desactivar los avisos de pedidos listos que ya estaban configurados. `kitchen_alerts` iniciará desactivado y requerirá una acción explícita.

También se crea `public.push_notification_events`, un registro técnico sin contenido sensible que guarda una clave idempotente, pedido, tema, transición y resultado del intento. La clave para un pedido nuevo se deriva del pedido creado. La clave de un pedido listo se deriva de la entrada concreta de `order_status_log`, por lo que un pedido que vuelva legítimamente a preparación y después a listo puede generar un aviso nuevo sin duplicar el anterior.

`is_active` se conserva por compatibilidad y representa que al menos un tema está activo. La escritura se centraliza en una función transaccional que:

1. valida la sesión y que el perfil siga activo;
2. crea o actualiza la suscripción del usuario y endpoint actuales;
3. modifica únicamente el tema solicitado;
4. recalcula `is_active` como la unión de ambos temas;
5. devuelve el estado guardado para que la interfaz no tenga que asumir el resultado.

La función será `SECURITY DEFINER`, fijará `search_path`, rechazará temas desconocidos y tendrá permisos únicamente para `authenticated`. RLS seguirá evitando que un usuario lea o modifique suscripciones de otra persona.

Los envíos consultarán solo suscripciones activas cuyo tema correspondiente esté habilitado. Las respuestas Web Push que indiquen una suscripción vencida la dejarán inactiva y apagarán ambos temas.

## Flujo de entrega

### Pedido nuevo

1. POS crea el pedido y sus artículos mediante la operación transaccional existente.
2. Con el identificador confirmado, solicita al servicio de notificaciones publicar el evento `new_order`.
3. El servicio vuelve a consultar el pedido en Supabase y no confía en el contenido enviado por el navegador.
4. Valida que el solicitante sea un perfil activo con permiso para crear o consultar el pedido.
5. Selecciona todos los perfiles activos y suscripciones con `kitchen_alerts = true`.
6. Envía el Push con folio, ubicación y destino de Cocina.

### Pedido listo

1. Cocina cambia el estado a `ready` mediante el flujo existente.
2. El servicio publica `ready` y obtiene el pedido desde Supabase.
3. Selecciona todos los perfiles activos y suscripciones con `ready_alerts = true`, incluidos propietario, administrador y supervisor cuando hayan activado ese tema.
4. Envía el Push con ubicación y destino de Estado.

La función de servidor será idempotente por pedido, tipo de evento y transición de estado para que un reintento no genere avisos duplicados. Un fallo de Push no revierte la creación ni el cambio de estado del pedido; se registra como fallo de notificación y la operación principal permanece válida.

## Service worker y prevención de duplicados visuales

El payload incorporará `topic`, `eventId`, `orderId` y `url`. Antes de mostrar un banner, el service worker revisará las ventanas visibles del mismo origen:

- para `new_order`, suprime el banner si `/dashboard/cocina` está visible;
- para `ready`, lo suprime si `/dashboard/mesero` está visible;
- en cualquier otra ruta sí muestra el Push.

Las etiquetas serán distintas por tema y pedido para que un evento no reemplace otro pedido diferente.

## Resiliencia de Cocina

La carga y Realtime se endurecen sin sustituir datos reales por contenido temporal:

- cada consulta de pedidos tendrá un límite de tiempo explícito;
- la promesa compartida se liberará siempre, incluso ante timeout;
- un error conservará los últimos pedidos cargados y mostrará un estado `Sin conexión, reintentando`;
- el botón de actualizar iniciará una solicitud nueva después de un fallo;
- la reconexión aplicará espera progresiva con máximo de 30 segundos y se reiniciará al recuperar `SUBSCRIBED`;
- solo existirá un canal y un temporizador de respaldo por vista;
- el sondeo de respaldo no iniciará otra consulta si ya existe una en curso;
- al recuperar conexión se actualizarán los pedidos sin recargar toda la página.

El desbloqueo de audio local ocurrirá al activar el control de Cocina o en la primera interacción válida con la pantalla. El estado de sonido solo se marcará activo después de confirmar que el navegador permitió prepararlo.

## Cierre de caja

El modal de corte mostrará un bloque de cálculo antes de confirmar:

`Fondo inicial + ventas en efectivo + entradas - retiros - gastos + correcciones = efectivo esperado`

También conservará:

- efectivo contado;
- diferencia;
- tarjeta y transferencia como referencias separadas;
- autorización actual cuando la diferencia exceda el límite.

El fondo inicial se toma del turno actual ya guardado en Supabase. No se cambia la fórmula contable ni el esquema de caja. El historial continuará mostrando el snapshot de cada corte.

## Estados de error

- **Permiso Push rechazado:** explicar cómo habilitarlo desde la configuración del dispositivo sin solicitar el permiso repetidamente.
- **PWA no instalada cuando es obligatorio:** explicar que debe instalarse antes de recibir avisos en segundo plano.
- **Error al guardar preferencia:** conservar el estado anterior y mostrar una acción para reintentar.
- **Suscripción vencida:** desactivarla en servidor y permitir crear una nueva desde el control.
- **Fallo parcial de envío:** continuar con las demás suscripciones y registrar cuántas fallaron.
- **Realtime desconectado:** conservar tarjetas, mostrar conexión degradada y usar sondeo con espera progresiva.
- **Consulta agotada:** liberar el indicador de carga y permitir actualización manual.

## Validación

### Base de datos

- probar migración aditiva y retrocompatibilidad de suscripciones existentes;
- comprobar que cada tema se activa y pausa sin alterar el otro;
- comprobar aislamiento entre usuarios y endpoints;
- ejecutar `npx supabase migration list` y `npx supabase db push --linked --dry-run` antes de aplicar;
- revisar asesores de seguridad y rendimiento después de aplicar.

### Aplicación

- agregar pruebas de regresión para estados de preferencias y errores remotos;
- verificar que una consulta colgada libere `loading`, conserve los pedidos anteriores y permita reintentar;
- comprobar supresión del banner únicamente en la vista visible correspondiente;
- comprobar que el corte muestre el fondo inicial y la fórmula esperada;
- ejecutar `npm run lint`, `npm run build` y las pruebas funcionales disponibles.

### Dispositivos reales

La prueba final requiere la versión HTTPS desplegada y una PWA instalada:

1. activar solo Cocina en un dispositivo y confirmar que recibe un pedido nuevo, pero no uno listo;
2. activar solo Entrega en otro dispositivo y confirmar el caso inverso;
3. activar ambos para propietario o supervisor;
4. confirmar sonido y animación con la vista abierta;
5. confirmar Push con la PWA cerrada y en segundo plano;
6. pausar cada tema y confirmar que deja de llegar sin afectar el otro;
7. abrir el aviso y comprobar su destino.

No se declarará verificado el Push móvil hasta completar estas pruebas físicas, porque los permisos y restricciones del sistema operativo no pueden comprobarse desde localhost.

## Criterios de aceptación

- propietario, administrador y supervisor pueden activar y recibir ambos tipos de aviso en sus dispositivos;
- Mesero y Cocina conservan controles adecuados a sus vistas;
- pausar un tema no pausa el otro ni otro dispositivo del mismo usuario;
- no hay doble aviso cuando la pantalla responsable ya está visible;
- Cocina sale del estado de carga después de timeout y vuelve a intentar sin recargar;
- los pedidos visibles no desaparecen durante una interrupción temporal;
- el corte muestra claramente el fondo inicial y cómo participa en el efectivo esperado;
- lint, build, migración y verificaciones remotas terminan sin errores.
