# Matriz de brechas y dependencias

**Estado:** revisión técnica en modo lectura. Este documento no autoriza implementación.

## Propósito

Comparar la operación actual de Mideli con la operación multinegocio aprobada para Rincón 404 Food Park. La prioridad es detectar qué puede conservarse y qué debe cambiarse antes de registrar un segundo negocio.

## Resumen ejecutivo

La base actual es reutilizable, pero todavía tiene varios límites globales. Los riesgos no están principalmente en las pantallas, sino en las funciones de Supabase, los triggers, la caja y los permisos.

La migración segura debe seguir esta regla:

> Primero se agrega el contexto de negocio sin cambiar el resultado visible de Mideli; después se activa la separación operativa; al final se incorpora Just Dipping.

## Comparación actual y objetivo

| Área | Situación actual | Objetivo | Riesgo | Prioridad |
|---|---|---|---|---|
| Identidad | Un perfil tiene un rol global | Membresías y permisos por negocio | Un usuario podría ver o modificar datos ajenos | Crítica |
| Catálogo | Categorías y productos globales | Catálogo por negocio | Menús mezclados en POS y WhatsApp | Crítica |
| Carrito | Un carrito crea una orden | Un carrito puede generar una cuenta por negocio | Crear solo una parte o mezclar inventario | Crítica |
| Pedido | Una orden no tiene negocio | Orden hija asociada a negocio y visita | Cocina e historial incorrectos | Crítica |
| Mesa | Pedidos se agrupan por mesa | Visita de mesa con cuentas independientes | Mezclar clientes de turnos distintos | Alta |
| Estado | La tienda consulta pedidos globales | Cada usuario consulta el alcance permitido | Personal local ve pedidos ajenos | Crítica |
| Cocina | Cocina global de Mideli | Cocina habilitable por negocio | Just Dipping podría aparecer en la cocina incorrecta | Alta |
| Just Dipping | No está dentro del modelo actual | Estado propio sin pantalla de Cocina | No existe todavía dueño, menú ni personal confirmado | Media |
| Cobros | Payment Flow puede recibir varias órdenes | Un cobro debe pertenecer a un negocio | Dinero en la caja equivocada | Crítica |
| Caja | Hay una caja global abierta | Una caja por negocio | Cierres y gastos mezclados | Crítica |
| Inventario | Recetas y triggers son globales | Receta e insumos por negocio | Descuento doble o inventario cruzado | Crítica |
| Historial | Consulta órdenes globales | Historial filtrado por negocio y visita | Datos de otros negocios visibles | Crítica |
| Reportes | Ventas y cortes globales | Reportes por negocio y resumen técnico | Resultados financieros incorrectos | Alta |
| Realtime | Canales escuchan tablas globales | Canales y cachés incluyen negocio | Alertas o sonidos en dispositivos equivocados | Alta |
| WhatsApp | Configuración única de Mideli | Canal asignado explícitamente a Mideli | Mezclar clientes o pedidos con otro negocio | Alta |
| Imágenes | Catálogo y archivos sin límite de negocio | Archivos propiedad del negocio | Colisiones al editar o borrar productos | Media |
| Impresión | Existe configuración global de impresión | Configuración por negocio, si se usa | Tickets enviados al dispositivo incorrecto | Media |
| Licencias | Control global de la aplicación | Licencia y estado comercial por negocio | Dificultad para vender a varios negocios | Posterior |

## Componentes que deben conservarse

No conviene reemplazar estas partes, sino agregarles contexto:

- Flujo visual de Mesero.
- Pantalla de Cocina de Mideli.
- Estado e Historial.
- `PaymentFlow` para pagos parciales, combinados y divididos.
- Lógica de inventario y devolución por cancelación.
- Plano de mesas compartido.
- WhatsApp de Mideli.
- Autorizaciones actuales de caja y descuentos.
- Folios y datos históricos existentes.

## Componentes que deben recibir el contexto de negocio

El contexto no puede vivir solamente en React o Zustand. Debe llegar hasta el servidor y la base de datos.

### Frontend

- Catálogo y caché.
- Carrito y borradores.
- Estado e Historial.
- Cocina.
- Caja y gastos.
- Realtime, Push y sonidos.
- Navegación y permisos.

### Servidor

- Acciones de pedidos.
- Acciones de pagos.
- Acciones de caja.
- Acciones de inventario.
- Reportes y analíticas.
- Administración de personal.
- WhatsApp y pedidos externos.

### Base de datos

- Políticas RLS.
- Funciones RPC.
- Triggers de caja.
- Triggers de inventario.
- Triggers de estados.
- Índices por negocio y estado.
- Auditoría de cambios.

## Dependencias críticas del modelo actual

### Creación de pedidos

El RPC actual crea una sola fila de `orders` y sus líneas. Para un pedido mixto se necesitará una operación transaccional que:

1. Valide que cada producto pertenece al negocio esperado.
2. Cree o encuentre la visita de mesa.
3. Separe las líneas por negocio.
4. Cree las órdenes hijas.
5. Consuma inventario de cada negocio una sola vez.
6. Devuelva a la mesera el resultado agrupado.

### Cobro

El RPC de pago bloquea y actualiza las órdenes asignadas. En el modelo futuro debe validar que las órdenes de una transacción pertenezcan al mismo negocio y al mismo contexto de caja.

### Caja

Los triggers actuales buscan la única caja abierta. Antes de incorporar otro negocio, esta búsqueda debe depender del negocio y no de una caja global.

### Inventario

Los triggers consumen recetas al insertar líneas de pedido. La separación de negocio debe validarse antes de ejecutar el consumo para impedir que una línea use una receta o insumo equivocado.

### Estado y Cocina

Los stores actuales cargan pedidos activos globales. El filtrado debe ocurrir también en el servidor o en RLS. Filtrar solo después de descargar los datos no sería seguro.

### WhatsApp

WhatsApp continuará en Mideli. La configuración actual puede conservarse, pero debe quedar vinculada explícitamente a Mideli para que una futura alta de Just Dipping no la herede por accidente.

## Diseño conceptual mínimo

La migración necesitará distinguir estas entidades, sin decidir todavía nombres físicos de tablas:

```text
Rincón 404 Food Park
├── Negocios
│   ├── Membresías y permisos
│   ├── Catálogo
│   ├── Inventario y recetas
│   ├── Pedidos y estados
│   ├── Caja, gastos y pagos
│   └── Configuración operativa
├── Mesas y zonas compartidas
└── Visitas de mesa
    └── Cuentas hijas por negocio
        └── Pedidos y líneas
```

## Controles que deben existir antes del segundo negocio

- Prueba automática que intente leer el catálogo de otro negocio.
- Prueba que intente cobrar una orden en la caja equivocada.
- Prueba que intente editar inventario ajeno.
- Prueba que una mesera local intente enviar un producto a otro negocio.
- Prueba de pedido mixto con fallo parcial.
- Prueba de consumo adicional después de pagar.
- Prueba de cancelación de un negocio sin afectar otro.
- Prueba de Realtime para verificar que cada tableta recibe solo sus pedidos.
- Prueba de cierre y reapertura de una visita de mesa.
- Prueba de respaldo y restauración.

## Orden recomendado de construcción futura

1. Entidades de organización, negocio y membresía.
2. Aislamiento de catálogo y usuarios.
3. Contexto de negocio en servidor, RLS y navegación.
4. Backfill de todos los datos actuales a Mideli.
5. Contexto de caja, gastos, inventario y reportes.
6. Visita de mesa y cuentas por negocio.
7. Separación transaccional de pedidos mixtos.
8. Cobros separados y pruebas de auditoría.
9. Piloto Mideli.
10. Alta controlada de Just Dipping.

No se debe comenzar por crear el selector de negocios en la interfaz. Ese selector sería lo último visible de un límite que primero debe ser seguro en el servidor.
