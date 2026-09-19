# Modelo lógico y flujos operativos

**Estado:** propuesta conceptual. No es un esquema SQL y no autoriza implementación.

## Principio

La aplicación tendrá una sola experiencia visual, pero el servidor trabajará con tres niveles distintos:

```text
Rincón 404 Food Park
  ├── Contexto compartido: mesas, zonas y meseras globales
  ├── Negocio: Mideli, Just Dipping, futuros negocios
  └── Visita de mesa: el servicio actual de un grupo de clientes
        └── Cuenta de cada negocio
              └── Pedidos y productos
```

Esto permite que una mesa sea compartida sin que las ventas, inventarios o cobros se mezclen.

## Entidades conceptuales

### Organización

Representa Rincón 404 Food Park. Tiene configuración de plataforma, administrador, Coordinador, licencias y mesas compartidas.

### Negocio

Representa Mideli, Just Dipping u otro negocio autorizado. Tiene estado de ciclo de vida, dueño, datos comerciales, catálogo, inventario, caja, reportes y configuración operativa.

Estados recomendados:

- `borrador`.
- `activo`.
- `pausado`.
- `archivado`.
- `retirado`.

Retirar un negocio no elimina automáticamente su historial.

### Membresía

Relaciona una cuenta de usuario con la organización o un negocio y define sus permisos. Una mesera global tendrá alcance de organización; un cocinero tendrá alcance de negocio.

### Mesa y visita

Las mesas y zonas pertenecen a Rincón 404. Una visita identifica al grupo actual que ocupa una mesa y evita mezclarlo con un grupo posterior.

Una visita puede tener varias cuentas de negocio y varios pedidos adicionales.

### Cuenta de negocio

Es la parte de la visita que pertenece a un negocio. Contiene el saldo, estado de entrega y relación con uno o más pedidos.

Una cuenta puede estar pendiente, parcialmente pagada, pagada o anulada. Una cuenta pagada no se reabre; un consumo posterior crea otra cuenta relacionada.

### Pedido

Es una captura operativa enviada a un negocio. El pedido pertenece a una sola cuenta de negocio, aunque la mesera lo haya creado dentro de un carrito mixto.

### Línea de pedido

Conserva producto, precio, cantidad, variaciones, notas y fotografía o nombre histórico necesarios para cocina, cobro e historial.

El precio y el nombre usados en el pedido deben conservarse aunque después cambie el menú.

### Caja y pago

Cada negocio puede tener su turno de caja y sus pagos. El pago registra negocio, cuenta, usuario que cobró, método, autorizaciones y auditoría.

### Catálogo e inventario

Cada negocio administra sus categorías, productos, variaciones, insumos, recetas y movimientos. Un producto no puede consumir inventario de otro negocio salvo que más adelante se defina explícitamente un insumo compartido.

## Flujo de un pedido mixto

```text
Mesera global
    ↓
Selecciona mesa y productos de varios menús
    ↓
Ve desglose por negocio y total general
    ↓
Servidor valida permisos, productos y mesa
    ↓
Transacción atómica
    ├── Cuenta/pedido Mideli → Cocina de Mideli
    └── Cuenta/pedido Just Dipping → Estado de Just Dipping
    ↓
La mesera recibe el estado independiente de cada parte
    ↓
Cada negocio marca su parte como lista
    ↓
La mesera entrega cada parte por separado
    ↓
Se cobran cuentas separadas
```

Si la transacción falla, no debe quedar una parte creada sin que la mesera sepa qué ocurrió.

## Flujo de un pedido local

```text
Trabajador desde tableta del negocio
    ↓
El sistema fija el negocio por cuenta o dispositivo
    ↓
Solo ve su catálogo
    ↓
Solo crea pedidos de su negocio
    ↓
Solo cambia estados de su negocio
```

No debe existir un botón que permita a un trabajador local cambiar de negocio y acceder a otro sin una membresía explícita.

## Flujo de cobro

```text
Mesera abre el resumen de mesa
    ↓
El sistema muestra cuentas separadas
    ↓
Selecciona la cuenta de Mideli o Just Dipping
    ↓
Payment Flow recibe solo pedidos de esa cuenta
    ↓
El pago se registra en la caja del negocio correcto
    ↓
La cuenta queda pagada o parcialmente pagada
```

La mesera puede cobrar para cualquier negocio, pero la cuenta, caja, autorización y auditoría siguen perteneciendo al negocio cobrado.

## Flujo de Estados

### Mideli

La pantalla de Cocina recibe solamente órdenes de Mideli. Sus cambios pueden ser:

```text
Pendiente → Preparando → Listo → Entregado / Pagado
```

### Just Dipping

Su personal opera desde Estado, sin pantalla de Cocina:

```text
Pendiente → Preparando → Listo → Entregado / Pagado
```

La lógica de negocio es la misma; cambia la pantalla operativa disponible.

## Flujo de cancelación o reemplazo

- Un negocio puede cancelar o reemplazar únicamente productos de su cuenta.
- Si Mideli cancela su parte, Just Dipping continúa normalmente.
- La mesera puede corregir el producto enviado al negocio equivocado mediante el flujo autorizado de corrección.
- Una corrección debe aparecer en Estado, Cocina cuando corresponda, inventario e historial.
- Después de un cobro, una devolución requiere autorización del negocio y no altera los cobros de otros negocios.

## Flujo de mesa y cierre

- Una visita puede tener más de una cuenta abierta.
- La mesera puede agregar productos después de enviar el primer pedido.
- Cada negocio puede terminar y cobrar su parte independientemente.
- La visita se cierra cuando todas sus cuentas están pagadas, anuladas o resueltas.
- Si se sienta otro grupo en la misma mesa, debe comenzar una visita nueva.

## Configuración por negocio

Cada negocio debe poder indicar, sin duplicar pantallas:

- Si usa pantalla de Cocina.
- Si usa Estado para preparación directa.
- Qué usuarios locales puede administrar.
- Qué catálogo publica.
- Qué caja y reglas de autorización utiliza.
- Qué dispositivos le pertenecen.
- Qué canales, como WhatsApp, están habilitados.

En la primera etapa:

- Mideli: Cocina y WhatsApp.
- Just Dipping: Estado, sin Cocina, pendiente de carga de dueño y catálogo.

## Decisiones técnicas que siguen después de esta propuesta

Cuando se apruebe el modelo lógico, todavía habrá que definir:

1. Nombres físicos de entidades y columnas.
2. Qué datos actuales reciben `Mideli` como asociación inicial.
3. Cómo se conservan los folios existentes.
4. Qué funciones RPC se reemplazan o se sobrecargan.
5. Qué políticas RLS se crean.
6. Qué consultas deben incluir índices por negocio y estado.
7. Cómo se prueban las transacciones mixtas y el rollback.
