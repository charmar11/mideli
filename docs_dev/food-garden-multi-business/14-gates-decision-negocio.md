# Gates de decisión del negocio

Este documento reduce las decisiones pendientes a lo mínimo necesario para
comenzar la fundación en staging. No reemplaza las especificaciones; indica
qué está decidido, qué requiere confirmación y qué puede esperar.

## Decisiones ya fijadas

- La organización será `Rincón 404 Food Park`.
- Mideli será el primer negocio migrado.
- Just Dipping se incorporará después del piloto de Mideli.
- Las credenciales actuales de Mideli deben conservarse.
- El administrador de plataforma será distinto del dueño de Mideli.
- El dueño administra su propio personal y su operación.
- El Coordinador administra meseras globales y el plano de mesas compartidas.
- Las meseras globales pueden capturar, entregar y cobrar para negocios
  habilitados.
- El personal local queda limitado a su negocio.
- Cada negocio abre y cierra su propia caja y conserva sus propios cobros,
  gastos, historial e inventario.
- Mideli conserva Cocina; WhatsApp permanece exclusivo de Mideli al inicio.
- No se borran ventas, pagos, caja ni auditoría por retirar un negocio.

## Confirmaciones mínimas antes de crear staging

### 1. Entorno aislado

Confirmar que se autoriza crear una rama Supabase Preview persistente y un
Preview de Vercel sin datos de producción. La recomendación es iniciar con
fixtures sintéticos y no usar `--with-data`.

### 2. Identidad de plataforma

Confirmar qué identidad de Auth corresponde al administrador máximo de Rincón
404. No se debe asumir que `Administrador`, `admin` o cualquier otro nombre
visible sea esa cuenta. La identidad debe verificarse por `auth.users.id` antes
de sembrar la membresía.

### 3. Regla de retención

El cuestionario contiene dos respuestas distintas: conservar el historial sin
borrarlo y permitir consulta durante 60 días al retirar un negocio. La regla
propuesta para implementar es:

- ventas, pagos, caja y auditoría se conservan indefinidamente;
- el acceso operativo del negocio retirado se mantiene 60 días;
- después se revoca el acceso y se permite exportación autorizada;
- cualquier borrado posterior es excepcional, manual y separado de la
  contabilidad.

### 4. Datos para el piloto

Confirmar que el primer backfill de staging usará datos anonimizados. La
fundación de organización, Mideli y membresías no necesita copiar clientes,
domicilios, conversaciones ni pedidos reales.

## Decisiones que no bloquean la fundación

- Alta real y personal de Just Dipping.
- Conservación o importación de su sistema anterior.
- Conteo exacto de dispositivos e impresoras de cada negocio.
- Colores, logotipo y catálogo de futuros negocios.
- Licencia individual y precio comercial por negocio.
- Inventario compartido.
- WhatsApp de negocios futuros.
- Facturación fiscal.

## Criterio de entrada

Con las cuatro confirmaciones mínimas anteriores, la primera rebanada puede
implementarse en staging sin alterar producción, credenciales, folios ni
WhatsApp de Mideli. Si alguna no está confirmada, se puede continuar afinando
documentación y pruebas locales, pero no se debe sembrar una membresía real ni
crear el esquema multinegocio en producción.
