# Cuestionario maestro para Rincón 404 Food Park

## Para qué sirve

Este cuestionario reúne las decisiones que necesitamos antes de convertir Mideli en una plataforma para varios negocios. No necesitas saber programación. Las respuestas describen cómo trabajan las personas, quién controla cada cosa y qué debe ocurrir durante un pedido.

Puedes responder poco a poco. Usa cualquiera de estas respuestas cuando corresponda:

- `Sí` o `No`.
- `No aplica`.
- `No lo sé todavía`.
- `Por confirmar con: nombre o función de la persona`.
- `Respuesta provisional: ...`.

No escribas contraseñas, códigos PIN, tokens, datos bancarios ni información privada de clientes en este documento.

## Orden recomendado para llenarlo

No intentes responder las 173 preguntas de una sola vez:

1. Empieza con `A`, `B`, `D` y `F`. Esas respuestas definen la operación general, los pedidos compartidos y el dinero.
2. Pide a cada dueño que revise `C`, `E`, `G`, `H`, `I`, `J` y `K` para su propio negocio.
3. Revisa el bloque `L` únicamente con las personas autorizadas de Just Dipping.
4. Completa `M` cuando ya exista una propuesta de piloto.
5. Deja `N` para después; no bloquea la primera versión dentro de Rincón 404.

Si dos personas responden distinto, no elijas por ellas. Conserva ambas respuestas e indica quién dijo cada una.

## Decisiones ya confirmadas

Estas decisiones no necesitan volver a responderse:

- La organización se llama `Rincón 404 Food Park`.
- Los negocios confirmados actualmente son `Mideli` y `Just Dipping`.
- Cada negocio tendrá separados su menú, inventario, pedidos, ventas, gastos, cortes, reportes y permisos.
- El dueño de cada negocio administrará a su propio personal.
- El administrador de plataforma no administrará diariamente al personal de los negocios.
- El rol operativo compartido se llamará `Coordinador`.
- El Coordinador podrá crear, activar y desactivar cuentas de meseras globales; los dueños conservarán el control del personal interno de sus negocios.
- El Coordinador administrará el plano, las zonas y la numeración de las mesas compartidas. Los dueños podrán consultarlas y usarlas, pero no cambiar su estructura.
- El administrador de plataforma podrá crear, pausar, archivar, restaurar y transferir negocios.
- Los negocios con historial no se eliminarán físicamente.
- Las cuentas actuales de Mideli conservarán sus credenciales.
- El WhatsApp actual seguirá siendo exclusivo de Mideli en la primera etapa.
- Just Dipping no tendrá acceso al WhatsApp, clientes ni domicilios de Mideli.
- El sistema anterior de Just Dipping no se conectará directamente a la operación nueva.
- La conservación del historial anterior de Just Dipping está contemplada, pero requiere autorización de los demás dueños.
- Esta etapa es de planificación. No autoriza migraciones ni cambios en producción.
- El diseño se dividirá en tres especificaciones: usuarios y seguridad; pedidos y cobros multinegocio; migración y piloto.
- La transición comenzará con Mideli sin cambiar su funcionamiento visible. Just Dipping se incorporará después de validar Mideli y recibir las autorizaciones necesarias.

---

# Parte 1. Decisiones esenciales para diseñar el sistema

## A. Objetivo y alcance inicial

### A1. ¿Cuál es el resultado más importante que esperas obtener con el sistema multinegocio?

Respuesta: con el sistema multi negocio. Facilitar el trabajo de la mesaera porque la mesera tiene que tener el menú de los restaurantes actuales, como de los otros restaurantes que se vayan agregando.

### A2. ¿Qué problema debe resolver primero: rapidez de la mesera, separación de cocinas, separación de cuentas, control de dueños u otro?

Respuesta: facilidad para la mesera de estar manejando las cuentas y todo esto de cada restaurante.

### A3. ¿La primera versión se usará solamente dentro de Rincón 404 Food Park?

Respuesta: [ X ] Sí  [ ] No  [ ] Por confirmar

### A4. ¿La primera versión debe iniciar únicamente con Mideli y Just Dipping?

Respuesta actualizada: la transición será por etapas. Primero se migrará Mideli al nuevo modelo sin cambiar su funcionamiento; después se incorporará Just Dipping.

### A5. ¿Qué tendría que funcionar correctamente para que consideres exitosa la primera semana?

Respuesta: Que la mesera pueda mandar un pedido con diferentes productos, por ejemplo 1 producto de mideli y 2 de just dipping, que les llegue a los restaurantes y que le diga a la mesera que ya esta listo etc con la notificacion pushup que tiene a las meseras, y que al sacar la cuenta, que pueda cobrar de acuerdo al restaurante que salio el pedido, ya hay logica de cobro

### A6. ¿Qué funciones pueden dejarse para una segunda etapa sin afectar la operación?

Respuesta: No entendi

### A7. ¿Quién dará la aprobación final para comenzar a usar la versión multinegocio?

Respuesta: Yo la dare el desarrollador

## B. Negocios y administración general

### B1. ¿Quién puede autorizar que un negocio nuevo entre a Rincón 404?

Respuesta: Yo, el creador del programa

### B2. ¿Qué datos mínimos debe proporcionar un negocio para registrarse?

Ejemplos: nombre, logotipo, nombre del dueño, teléfono, correo, horario y tipo de cocina.

Respuesta: nombre, logotipo, nombre del dueño, teléfono, correo (opcional), horarios y algunas opciones elegibles como si quiere vista de cocina etc.

### B3. ¿Un negocio puede tener más de un dueño con el mismo nivel de control?

Respuesta: [ X ] Sí  [ ] No  [ ] Por confirmar

### B4. ¿Quién decide cuándo un negocio ya está listo para recibir pedidos?

Respuesta: El mismo dueño que lo pueda activar cuando esta creando el negocio como tal

### B5. ¿El administrador de plataforma puede pausar un negocio inmediatamente por seguridad o falta de pago?

Respuesta: [ X ] Sí  [ ] No  [ ] Solo con autorización

### B6. ¿Qué debe ocurrir con pedidos abiertos si un negocio se pausa durante el turno?

Respuesta: Teoricamente no deberia pausarse el turno, pero de ser asi que se queden los pedidos hasta finalizarlos

### B7. ¿Qué información podrá ver el administrador de plataforma sobre cada negocio?

Marca lo permitido: [ X] Estado técnico  [ ] Usuarios  [ ] Ventas totales  [ ] Ventas detalladas  [ ] Inventario  [ ] Gastos  [] Clientes  [ ] Nada sin autorización

Respuesta adicional: Solamente el crear o quitar los negocios las estadisticas de cada negocio son  vista de los propios dueños

### B8. ¿Un dueño podrá solicitar una copia o exportación completa de la información de su negocio?

Respuesta: [ X ] Sí  [ ] No  [ ] Por confirmar

### B9. Si cambia el dueño de un negocio, ¿quién autoriza la transferencia y qué información conserva el dueño anterior?

Respuesta: Autorizare yo, el admin

### B10. Cuando un negocio se retire de Rincón 404, ¿durante cuánto tiempo debe poder consultar su historial?

Respuesta: Durante 60 dias y despues se borren

## C. Usuarios, personal y acceso

### C1. ¿Qué tipos de personal existen realmente en Rincón 404?

Ejemplos: dueño, administrador del negocio, supervisor, mesera, cocina, caja y repartidor.

Respuesta: En Rincon 404, estoy yo el dueño del programa, estan los dueños de los negocios, su supervisor, meseros (que son globales para todos los locales) osea un mesero va a cada local de ahi mismo, cocina, caja y el repartidor es externo, es de un grupo de whatsapp. Pero a veces el mismo cocinero es caja, y a veces que tambien mesero.

### C2. ¿Qué tipos de personal necesita Mideli?

Respuesta: Necesita, mesero (global),  y un cocinero que tambien es caja.

### C3. ¿Qué tipos de personal necesita Just Dipping?

Respuesta: Necesita, mesero (global),  y un cocinero que tambien es caja.

### C4. ¿Una misma mesera trabajará para varios negocios durante el mismo turno?

Respuesta: [ X] Sí  [ ] No  [ ] A veces

### C5. ¿Una persona puede tener funciones diferentes en cada negocio?

Ejemplo: supervisora en Mideli y mesera en Just Dipping.

Respuesta: [ ] Sí  [ X] No  [ ] Por confirmar

### C6. ¿El dueño podrá crear cuentas usando nombre de usuario corto, correo electrónico o cualquiera de los dos?

Respuesta: [X ] Usuario corto  [ ] Correo  [ ] Ambos  [ ] Por confirmar

el dueño que cree el usuario nomas, no quiero meter correos ni nada en el sistema, de hecho me gustaria borrar lo que tenga @mideli predeterminado y que solo sean usarios como "admin" "meseroMideli" etc

### C7. ¿Cómo prefieres que el dueño entregue el acceso inicial a un empleado?

Respuesta: [ ] Invitación por correo  [X ] Usuario y contraseña temporal  [ ] Otra forma: ______
El dueño le da una contraseña y usuario

### C8. ¿El empleado deberá cambiar su contraseña al entrar por primera vez?

Respuesta: [ X ] Sí  [ ] No

### C9. ¿Quién puede desactivar a un empleado durante un turno?

Respuesta: el dueño del negocio

Decisión posterior: el dueño desactiva al personal local de su negocio. El Coordinador desactiva a las meseras globales de Rincón 404.

### C10. ¿Qué debe ocurrir en los dispositivos donde un empleado desactivado ya tenía sesión abierta?

Respuesta: [ ] Cerrar inmediatamente  [ X] Cerrar al terminar el pedido actual  [ ] Por confirmar

### C11. ¿El dueño podrá ver un historial de altas, cambios de rol y desactivaciones de personal?

Respuesta: [ X] Sí  [ ] No

### C12. ¿Qué acciones importantes deben pedir PIN o autorización adicional?

Ejemplos: descuentos, cancelaciones, devoluciones, correcciones de caja y borrado de información.

Respuesta: descuentos, cancelaciones, devoluciones, correcciones de caja y borrado de información. en dado caso de estar habilitados, porque normalmente esos solo estan habilitados para los dueños de los negocios o los encargados

### C13. Si un dueño pierde el acceso, ¿quién puede confirmar su identidad para recuperarlo?

Respuesta: Yo, el creador del programa

## D. Mesas, meseras y pedidos compartidos

### D1. ¿Las mesas pertenecen a Rincón 404 y son compartidas por todos los negocios?

Respuesta: [X ] Sí  [ ] No  [ ] Algunas son compartidas

### D2. ¿Quién debe administrar el plano y los números de mesa?

Respuesta actualizada: [ ] Administrador de plataforma  [ ] Dueños  [ ] Encargado de Rincón 404  [X] Otro: Coordinador

Decisión posterior: el Coordinador administra el plano, las zonas y los números de mesa compartidos. Los dueños y su personal pueden consultarlos y seleccionarlos durante la operación, pero no modificar su estructura.

### D3. ¿Una mesa puede pedir productos de varios negocios dentro del mismo servicio?

Respuesta: [X ] Sí  [ ] No

### D4. ¿La mesera debe armar un solo pedido visible y dejar que el sistema lo separe automáticamente por negocio?

Respuesta: [X ] Sí  [ ] No  [ ] Por confirmar

### D5. ¿La mesa debe tener un número general de servicio además de los folios de cada negocio?

Respuesta: [X ] Sí  [ ] No  [ ] Por confirmar

### D6. ¿La mesera puede agregar productos de otro negocio después de haber enviado la primera parte a cocina?

Respuesta: [X ] Sí  [ ] No  [ ] Solo con autorización

### D7. ¿Una mesa puede tener más de un servicio abierto al mismo tiempo?

Respuesta: [X ] Sí  [ ] No

### D8. ¿Cómo se asigna la mesera responsable de una mesa?

Respuesta: [X ] Automáticamente al crear el pedido  [ ] Se selecciona  [ ] La puede tomar cualquiera

### D9. ¿Se puede transferir una mesa o pedido a otra mesera?

Respuesta: [X ] Sí  [ ] No  [ ] Solo supervisor

### D10. Si Mideli cancela su parte, ¿la parte de Just Dipping debe continuar normalmente?

Respuesta: [X ] Sí  [ ] No  [ ] Depende: ______

### D11. Si una cocina rechaza un producto agotado, ¿quién elige el reemplazo o cancelación?

Respuesta: Desde cocina al negocio que se mande se puede cancelar o reemplazar

### D12. ¿La mesera necesita ver un estado independiente para cada negocio?

Ejemplo: Mideli preparando, Just Dipping listo.

Respuesta: [ X] Sí  [ ] No

### D13. ¿Cuándo se considera que el pedido completo de una mesa está listo?

Respuesta: [ ] Cuando todos los negocios terminan  [X ] Cada parte se entrega por separado  [ ] Depende del pedido

### D14. ¿Qué debe ver una mesera sobre productos y tiempos de negocios donde no tiene permiso administrativo?

Respuesta: Los productos, mesa a donde va, si ya esta listo el pedido etc. lo necesario para poder entregar el pedido

### D15. ¿Quién puede corregir un producto enviado accidentalmente al negocio equivocado?

Respuesta: La mesera editando el producto desde historial

## E. Cocina y estaciones de preparación

### E1. ¿Mideli seguirá usando la pantalla de Cocina actual?

Respuesta: [X ] Sí  [ ] No  [ ] Por confirmar

### E2. ¿Just Dipping utilizará pantalla de cocina, impresora, ambas o ninguna?

Respuesta: [ ] Pantalla  [ X ] Impresora  [ ] Ambas  [ ] Ninguna  [ ] Por confirmar

### E3. ¿Cada negocio tendrá su propia tableta o compartirán dispositivos?

Respuesta: Cada negocio tiene su propia tableta

### E4. ¿Un dispositivo compartido debe mostrar varias cocinas al mismo tiempo o permitir cambiar de negocio?

Respuesta: No debe haber dispositivos compartidos

### E5. ¿Cada producto pertenece siempre a una sola cocina o estación?

Respuesta: [ X] Sí  [ ] No  [ ] Algunos productos requieren varias estaciones

### E6. ¿Qué estaciones necesita cada negocio?

Ejemplos: plancha, sushi, freidora, bebidas y entrega.

Respuesta: No hay estaciones como tal son locales pequeños

### E7. ¿Quién puede marcar un producto o pedido como listo?

Respuesta: Los cocineros o desde el local de donde se realizo el pedido

### E8. ¿Se debe avisar a la mesera cuando termina cada negocio o solo cuando termina todo el servicio?

Respuesta: Cuando se termina cada negocio

### E9. ¿Qué debe ocurrir si una cocina pierde internet o cierra inesperadamente?

Respuesta:

### E10. ¿Las modificaciones y cancelaciones deben aparecer inmediatamente en cocina y quedar registradas?

Respuesta: [ X ] Sí  [ ] No  [ ] Por confirmar

### E11. ¿Cada negocio necesita medir su propio tiempo de preparación?

Respuesta: [X ] Sí  [ ] No

## F. Cobro, caja, propinas y devoluciones

### F1. ¿Cada negocio cobra su parte con su propia terminal y su propio efectivo?

Respuesta: [X ] Sí  [ ] No  [ ] Depende del método

### F2. ¿La mesera debe ver el total general de la mesa además del subtotal de cada negocio?

Respuesta: [X ] Sí  [ ] No

### F3. ¿El cliente recibe una sola cuenta visual o una cuenta separada por negocio?

Respuesta: [ ] Una general con secciones  [ X ] Una por negocio  [ ] Ambas

### F4. ¿El cliente paga una sola vez o se realizan cobros separados por negocio?

Respuesta: cobros separados por negocio

### F5. Si paga en efectivo, ¿quién recibe el dinero y cómo se entrega la parte de cada negocio?

Respuesta: cobros separados por negocio

### F6. Si paga con tarjeta, ¿se usan terminales diferentes para cada negocio?

Respuesta: [ X] Sí  [ ] No  [ ] Por confirmar

### F7. ¿Se permiten pagos combinados, parciales o divididos por persona en pedidos de varios negocios?

Respuesta: Si, ya esta implementada la logica

### F8. ¿Cómo se reparte la propina cuando participaron varios negocios?

Respuesta: a la mesera solamente

### F9. ¿Cada negocio autoriza sus propios descuentos?

Respuesta: [ X ] Sí  [ ] No  [ ] Hay descuentos generales

### F10. ¿Quién autoriza una cancelación o devolución después de cobrar?

Respuesta: en el negocio

### F11. Si solo se devuelve un producto de un negocio, ¿los demás cobros deben permanecer intactos?

Respuesta: [ X ] Sí  [ ] No  [ ] Por confirmar

### F12. ¿Cada negocio abre y cierra su propia caja?

Respuesta: [ X ] Sí  [ ] No  [ ] Algunos comparten caja

### F13. ¿Cada negocio registra sus propios gastos, retiros, fondos y correcciones?

Respuesta: [X  ] Sí  [ ] No  [ ] Por confirmar

### F14. ¿El administrador de Rincón 404 debe ver importes de caja o solo saber si cada negocio abrió y cerró correctamente?

Respuesta: Solo si abrio o no, no necesitamos saber dinero ni nada

### F15. ¿Qué debe ocurrir con una cuenta pendiente cuando cambia el turno o la mesera?

Respuesta: Solo hay un turno no creo que pase

### F16. ¿Necesitan facturación fiscal dentro del sistema ahora, después o no la necesitan?

Respuesta: [ ] Ahora  [ ] Después  [ X] No  [ ] Por confirmar

## G. Menú, productos y variaciones

### G1. ¿Cada dueño será responsable de capturar y publicar su propio menú?

Respuesta: [X ] Sí  [ ] No

### G2. ¿Los cambios de menú deben publicarse inmediatamente o prepararse como borrador antes de activarlos?

Respuesta: publicarse inmediatamente

### G3. ¿Un producto puede aparecer en más de una categoría dentro del mismo negocio?

Respuesta: [ ] Sí  [X ] No

### G4. ¿Dos negocios pueden tener productos con el mismo nombre sin compartir información?

Respuesta: [X ] Sí  [ ] No

### G5. ¿Cada negocio administrará sus propias fotos, descripciones y precios?

Respuesta: [ X] Sí  [ ] No

### G6. ¿Qué tipos de variaciones necesitan realmente?

Ejemplos: sabor, tamaño, proteína, extras múltiples, quitar ingredientes y cambiar guarnición.

Respuesta: Que cada quien pueda editar sus variaciones, ya hay logica para esto

### G7. ¿Cada opción debe mostrar claramente cuánto aumenta o disminuye el precio?

Respuesta: [X ] Sí  [ ] No

### G8. ¿Existen combos que incluyan productos preparados por más de un negocio?

Respuesta: [X ] Sí  [ ] No  [ ] Podría ocurrir después

### G9. ¿Un dueño puede desactivar temporalmente un producto sin borrarlo?

Respuesta: [X ] Sí  [ ] No

### G10. Si cambia el nombre o precio de un producto, ¿los pedidos anteriores deben conservar el nombre y precio originales?

Respuesta: [X ] Sí  [ ] No

### G11. ¿Se permitirá copiar categorías o productos de un negocio a otro?

Respuesta: [ ] Sí, con confirmación  [ X] No  [ ] Después

### G12. ¿Quién revisará y aprobará el catálogo importado de Just Dipping?

Respuesta: Yo

## H. Inventario, compras y costos

### H1. ¿Todos los negocios deberán usar inventario desde el primer día?

Respuesta: [ X] Sí  [ ] No  [ ] Será opcional por negocio

### H2. ¿Cada negocio compra y controla sus propios insumos?

Respuesta: [X ] Sí  [ ] No  [ ] Algunos insumos son compartidos

### H3. ¿Hay insumos físicos compartidos entre Mideli y Just Dipping?

Respuesta: [ ] Sí  [X ] No  [ ] Por confirmar

### H4. Si existen insumos compartidos, ¿quién es su propietario y quién registra su consumo?

Respuesta: No hay

### H5. ¿Se permitirán transferencias de inventario entre negocios?

Respuesta: [ ] Sí  [ X] No  [ ] Solo con autorización y registro

### H6. ¿Cada negocio debe mantener ocultos sus costos y proveedores frente a los otros dueños?

Respuesta: [ X] Sí  [ ] No

### H7. ¿Quién registra compras, recepciones, conteos, mermas y ajustes?

Respuesta: Dueño de cada negocio

### H8. ¿El sistema puede permitir existencias negativas para no detener las ventas?

Respuesta: [ X] Sí  [ ] No  [ ] Depende del negocio

### H9. ¿Qué debe ocurrir cuando un insumo llega al mínimo?

Respuesta: Avisar ya hay modulo de esto en la logica de mideli

### H10. ¿Un faltante de inventario debe ocultar automáticamente productos del POS?

Respuesta: [ ] Sí  [ ] No  [ X] Solo mostrar alerta

### H11. ¿Just Dipping tiene actualmente inventario, recetas o registros de compras que deban migrarse?

Respuesta: [X ] Sí  [ ] No  [ ] No lo sabemos

### H12. ¿Cada dueño necesita reportes de costo y margen que nadie más pueda consultar?

Respuesta: [ X] Sí  [ ] No

## I. Clientes, domicilio y WhatsApp

### I1. ¿Los datos de un cliente deben pertenecer solamente al negocio donde compró?

Respuesta: [X ] Sí  [ ] No  [ ] Puede existir contacto común, pero historial separado

### I2. Si una persona compra en Mideli y Just Dipping, ¿cada dueño puede ver únicamente las compras realizadas en su negocio?

Respuesta: [X ] Sí  [ ] No  [ ] Por confirmar

### I3. ¿Las direcciones y teléfonos pueden compartirse entre negocios o requieren autorización del cliente?

Respuesta: pueden compartirse entre negocios

### I4. ¿Solo Mideli atenderá pedidos por WhatsApp durante la primera etapa?

Respuesta confirmada: Sí.

### I5. ¿Un pedido recibido por WhatsApp de Mideli puede incluir productos de otro negocio?

Respuesta: [ ] Sí  [X ] No  [ ] Después

### I6. ¿Cada negocio tendrá su propia configuración de domicilio, zonas, horarios y tarifas?

Respuesta: [ ] Sí  [ ] No  [ X] Algunos compartirán configuración

### I7. Si un pedido incluye varios negocios, ¿un solo repartidor recoge todo o cada negocio envía por separado?

Respuesta: cada negocio envía por separado

### I8. ¿Quién cobra el envío y cómo se muestra ese dinero en la cuenta de cada negocio?

Respuesta: El repartidor cobra el envio y va agregado abajo en el total

### I9. ¿Los pedidos programados deberán funcionar por negocio según su horario y tiempo de preparación?

Respuesta: [X ] Sí  [ ] No  [ ] Después

### I10. ¿En el futuro cada negocio podrá conectar su propio número de WhatsApp?

Respuesta: [X ] Sí  [ ] No  [ ] Todavía no se decide

### I11. ¿Quién puede editar o eliminar clientes, domicilios y conversaciones?

Respuesta: Dueño del negocio

### I12. ¿Cuánto tiempo deben conservarse los datos de clientes y conversaciones?

Respuesta: Nunca se borran

## J. Historial, reportes y privacidad

### J1. ¿Cada dueño puede ver únicamente ventas, costos, caja y empleados de su negocio?

Respuesta: [X ] Sí  [ ] No  [ ] Excepciones: ______

### J2. ¿Qué resumen necesita el administrador de Rincón 404?

Marca lo necesario: [ ] Pedidos por negocio  [ ] Ventas totales  [ ] Tiempos  [ ] Negocios abiertos  [ ] Fallos técnicos  [ X ] Ningún dato financiero

### J3. ¿El administrador de Rincón 404 debe poder abrir el detalle de una venta?

Respuesta: [ ] Sí  [X ] No  [ ] Solo con autorización temporal

### J4. ¿Cada cambio de precio, pedido, pago, caja, usuario o inventario debe guardar quién lo hizo?

Respuesta: [X ] Sí  [ ] No

### J5. ¿Quién puede corregir información histórica y qué correcciones nunca deben permitirse?

Respuesta: los administradores de cada negocio

### J6. ¿Los dueños necesitan exportar reportes a PDF, Excel o ambos?

Respuesta: [ ] PDF  [X ] Excel  [ ] Ambos  [ ] Ninguno

### J7. ¿Cada dueño recibirá su propio resumen diario por correo?

Respuesta: [ ] Sí  [ X] No  [ ] Opcional

### J8. ¿Cuántos años debe conservarse el historial operativo?

Respuesta: nunca se borra

### J9. ¿El historial anterior de Just Dipping se mostraría separado y marcado como importado?

Respuesta provisional recomendada: Sí, pendiente de autorización.

### J10. ¿Un negocio retirado puede seguir descargando su historial?

Respuesta: [ ] Sí  [ ] No  [ X] Durante un periodo limitado 60 dias

## K. Notificaciones, dispositivos e impresión

### K1. ¿Qué dispositivos usa cada negocio?

Indica cantidad aproximada de teléfonos, tabletas, computadoras e impresoras.

Respuesta:

### K2. ¿Los dispositivos pertenecen al negocio, a Rincón 404 o a los empleados?

Respuesta: cada empleado tiene su celular y cada negocio tiene sus dispositivos

### K3. ¿Una mesera compartida debe recibir notificaciones de todos los negocios donde está trabajando?

Respuesta: [X ] Sí  [ ] No  [ ] Solo de sus mesas

### K4. ¿La notificación debe mencionar claramente el negocio y la mesa?

Respuesta: [X ] Sí  [ ] No

### K5. ¿Cada cocina necesita sonidos o alertas diferentes?

Respuesta: [ X] Sí  [ ] No  [ ] Opcional

### K6. ¿Cada negocio tendrá su propia impresora o pueden compartir una?

Respuesta: Cada negocio tendrá su propia impresora

### K7. Si comparten impresora, ¿cómo se distinguirán los tickets de cada negocio?

Respuesta: Cada negocio tendrá su propia impresora

### K8. ¿Qué debe hacer el sistema si una impresión falla?

Respuesta: por confirmar

### K9. ¿Quién puede configurar, pausar o cambiar una impresora?

Respuesta: dueño del negocio o supervisor

### K10. ¿Necesitan un panel donde el administrador técnico vea dispositivos desconectados sin ver ventas privadas?

Respuesta: [ ] Sí  [ X] No

---

# Parte 2. Preguntas que deben confirmarse con Just Dipping

## L. Información y migración del sistema anterior

### L1. ¿Quiénes son los dueños autorizados para decidir sobre la información del sistema anterior?

Respuesta: Yo soy el que tiene el control de ese sistema

### L2. ¿Autorizan realizar un respaldo o exportación técnica de sus datos?

Respuesta: [ X] Sí  [ ] No  [ ] Pendiente de conversación

### L3. ¿Desean conservar el historial de ventas anterior?

Respuesta: [X ] Sí  [ ] No  [ ] Pendiente

### L4. ¿Desean conservar cortes, retiros, gastos y métodos de pago anteriores?

Respuesta: [X ] Sí  [ ] No  [ ] Pendiente

### L5. ¿El historial importado debe ser únicamente de consulta, sin permitir editarlo ni borrarlo?

Respuesta recomendada: Sí.

### L6. ¿Qué fecha marca el inicio confiable de sus registros actuales?

Respuesta: N/A

### L7. ¿Existen pruebas, ventas falsas o tickets que no deben migrarse?

Respuesta: N/A

### L8. ¿Quién revisará que el total histórico importado coincida con el sistema anterior?

Respuesta: N/A

### L9. ¿El menú público actual es el menú verdadero y vigente?

Respuesta: [ ] Sí  [ ] No  [X ] Requiere revisión

### L10. ¿Por qué aparece `Extras` dos veces y cuál registro debe conservarse?

Respuesta: N/A

### L11. ¿Qué productos, categorías, extras o precios están desactualizados?

Respuesta: N/A

### L12. ¿Las imágenes actuales les pertenecen y autorizan migrarlas?

Respuesta: [ ] Sí  [ ] No  [X ] Pendiente

### L13. ¿Tienen inventario, recetas, proveedores o costos fuera del sistema actual?

Respuesta: N/A

### L14. ¿Qué funciones del sistema anterior usan realmente durante un turno?

Marca las usadas: [ X] Venta  [X ] Historial  [ X] Retiro  [ ] Corte  [X ] Estadísticas  [X ] Impresión  [X ] Domicilio  [ ] Otra: ______

### L15. ¿Qué funciones actuales no sirven, no usan o desean eliminar?

Respuesta: N/A

### L16. ¿Qué tipo de acceso usa hoy cada empleado si el sistema no muestra login?

Respuesta: N/A

### L17. ¿Qué impresora, tableta o computadora utiliza Just Dipping?

Respuesta: tableta kernel 95

### L18. ¿Qué día dejarían de capturar ventas en el sistema anterior?

Respuesta: N/A

### L19. Después del cambio, ¿cuánto tiempo necesitan conservar acceso de consulta al sistema anterior?

Respuesta: N/A

### L20. ¿Quién dará la aprobación final del catálogo, historial y saldos migrados?

Respuesta: Yo

---

# Parte 3. Preparación del piloto multinegocio

## M. Lanzamiento, capacitación y contingencias

### M1. ¿En qué dispositivo se debe probar primero el flujo completo de la mesera?

Respuesta: en dispositivos celulares lo usan las meseras

### M2. ¿Quiénes participarán en una prueba cerrada antes del lanzamiento?

Respuesta: Mideli principalmente

### M3. ¿Cuántos días debe durar la prueba antes de usarla en un fin de semana real?

Respuesta: Una semana

### M4. ¿Qué día y horario tienen menor carga para realizar el cambio?

Respuesta: De lunes a jueves

### M5. ¿Se permitirá capturar ventas nuevas simultáneamente en el sistema viejo y el nuevo?

Respuesta recomendada: No.

### M6. Si aparece un error grave, ¿quién puede decidir regresar temporalmente al sistema anterior?

Respuesta: Yo

### M7. ¿Qué errores obligan a detener el piloto?

Marca los críticos: [ X] Pedido perdido  [ X] Cobro incorrecto  [X ] Cocina equivocada  [X ] Inventario cruzado  [ X] Datos de otro negocio visibles  [ ] Otro: ______

### M8. ¿Qué debe poder hacerse si se cae internet?

Respuesta: No lo se, recomienda

### M9. ¿Cuánto tiempo máximo pueden esperar la mesera y cocina para ver un pedido nuevo?

Respuesta: maximo 10 segundos

### M10. ¿Quién capacitará a dueños, meseras y cocina?

Respuesta: No lo se

### M11. ¿Qué material de ayuda necesitan?

Respuesta: [ X ] Tutorial dentro de la app  [ ] Manual  [ ] Video  [ ] Capacitación presencial  [ ] Otro: ______

### M12. ¿Quién recibirá avisos técnicos durante la primera semana?

Respuesta: Todos, una notificacion de actualizacion

### M13. ¿Quién revisará diariamente que ventas, caja y pedidos coincidan?

Respuesta: No lo se

### M14. ¿Qué resultado debe cumplirse para declarar terminada la prueba?

Respuesta: Que todo fluya bien

### M15. ¿Cuándo estaría permitido retirar definitivamente el sistema anterior de Just Dipping?

Respuesta: Cuando el dueño acepte

---

# Parte 4. Decisiones comerciales que pueden esperar

## N. Crecimiento futuro

### N1. ¿La plataforma podría venderse posteriormente a otros food parks o restaurantes independientes?

Respuesta: [X ] Sí  [ ] No  [ ] Tal vez

### N2. ¿Un cliente futuro podría tener varias sucursales además de varios negocios?

Respuesta: [X ] Sí  [ ] No  [ ] Después

### N3. ¿Cada negocio pagaría su propia licencia o Rincón 404 pagaría una licencia general?

Respuesta: Cada negocio pagaría su propia licencia

### N4. ¿El precio dependería del número de negocios, usuarios, dispositivos o funciones?

Respuesta: Si

### N5. ¿Cada negocio podrá personalizar logotipo y colores o conservarán la identidad Mideli?

Respuesta: Si

### N6. ¿Habrá funciones opcionales por negocio, como WhatsApp, inventario o impresión?

Respuesta: [ X ] Sí  [ ] No  [ ] Por definir

### N7. ¿Quién proporcionará soporte a los dueños después del lanzamiento?

Respuesta:  Yo

### N8. ¿Qué tiempo de respuesta deseas prometer ante una falla crítica?

Respuesta: Masomenos 48 horas

### N9. ¿Un negocio podrá cancelar el servicio y llevarse una copia de sus datos?

Respuesta: [ X ] Sí  [ ] No  [ ] Por definir

### N10. ¿Qué información general necesitas tú para administrar licencias y salud del sistema sin intervenir en la operación diaria?

Respuesta: Ultimo pago, cantidad etc. todo lo que me ayude a adminisitrar las licencias

---

# Verificaciones técnicas que hará el programador

No necesitas contestar esta sección. Se investigará y documentará antes de implementar:

- Estado real de la base de datos remota y sus respaldos.
- Todas las tablas, funciones y permisos que actualmente suponen un solo negocio.
- Separación segura de usuarios y membresías.
- Migración compatible con las cuentas actuales de Mideli.
- Separación de cachés, carritos y borradores al cambiar de negocio.
- Separación de eventos en tiempo real, notificaciones, sonidos y tareas programadas.
- Separación de imágenes, archivos, impresoras y estaciones.
- Folios históricos y folios nuevos por negocio.
- Aislamiento de inventario, pagos, caja, gastos y reportes.
- Protección del WhatsApp y clientes de Mideli.
- Reglas y exportación autorizada de Firebase para Just Dipping.
- Entorno de prueba, respaldo previo, plan de reversión y fecha de corte.
- Pruebas automáticas que intenten acceder accidentalmente a otro negocio.
- Pruebas reales en teléfono, tableta, computadora, cocina e impresora.

# Espacio para observaciones generales

Escribe aquí cualquier situación real que no aparezca en las preguntas:

Respuesta: En general es eso. Solamente esta es básicamente la idea que tengo de cómo debería ser el flujo. Porque, por ejemplo, Just Dipping tiene su flujo, o sea, a él le llegan clientes, él escribe en su propio menú, o sea, desde ciertas tabletas que sea específicamente el menú solamente de ellos, porque ellos van a tener su tableta especial solamente de su negocio. Entonces sí va a haber meseras, pero meseras que sean de todos los locales de comida y otros meseros, otros que sean específicamente solamente del negocio. Porque pues hay meseros que no es mesero, sino que ahí mismo en el negocio van a llegar algunos clientes y ahí mismo sin ir con la mesera van a pedir. Entonces es importante también que tengamos ese rango de meseros de todos los locales y meseros solamente específicamente de un local. También que específicamente ese local solamente pueda ponerle listo al pedido a los suyos y que no les aparezcan de otros locales, pues para que no se malinterprete. Ahí la que tendría más poder de control sobre todos los locales sería técnicamente la mesera general, porque la mesera de todos los locales ella sí puede poner, mandar pedidos hacia los otros locales y los otros locales pues pueden poner de que recibido, en preparación, etcétera. pero que ellos no puedan mandar pedidos hacia otros locales. ¿Eso para qué? Para no tener problemas con lo que viene siendo esto de... no sé, pues de los malentendidos, etcétera. Entonces, en general quiero que la mesera tenga un trabajo muy, muy más digerible, que pueda calcular las cuentas, que pueda calcular o que pueda mandar los pedidos rápidamente hacia cada local y todo esto, ¿no?
