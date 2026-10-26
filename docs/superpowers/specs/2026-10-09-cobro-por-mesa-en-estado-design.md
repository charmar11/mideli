# Agrupar pedidos y cobrar por mesa en Estado

## Objetivo

En Estado, que los pedidos de comedor sean fáciles de revisar por mesa y que
el personal pueda iniciar el cobro de la cuenta de esa mesa desde el modal de
cobro existente.

## Diseño aprobado

- Agrupar visualmente los pedidos de comedor dentro de cada etapa actual de
  Estado. Domicilio y para llevar conservan sus tarjetas individuales.
- La visita física (`table_visit_id`) identifica la mesa compartida entre
  negocios. Los pedidos legacy sin visita usan el identificador de mesa y, en
  último caso, zona y número visibles.
- El bloque de mesa muestra los pedidos y el nombre de cada negocio. En el
  cobro se conserva una cuenta independiente por negocio, con su caja y sus
  permisos; no se combinan ventas de locales distintos.
- El botón de cobro usa `PaymentFlow`, que permite pagar la cuenta completa,
  dividir en partes iguales o por productos. Reúne saldos abiertos de la misma
  visita y cuenta, aunque estén en otra etapa de Estado.
- Si una mesa tiene cuentas de más de un negocio, muestra un botón de cobro
  para cada negocio. El modal identifica la mesa y el negocio que se cobrará.
- Una visita nueva en la misma mesa física nunca se mezcla con una visita
  anterior. La UI no crea ni cambia pedidos, cuentas o movimientos de caja.

## Verificación

Pruebas dirigidas deben comprobar agrupación compartida de una visita entre
negocios, separación de visitas sucesivas de una misma mesa, aislamiento de
cuentas entre negocios y que domicilio/para llevar no se agrupen. Ejecutar
también `npm run lint` y `npm run build`.

## Alcance

Sin cambios de esquema ni migraciones. Esta especificación no autoriza por sí
sola un deploy a producción.
