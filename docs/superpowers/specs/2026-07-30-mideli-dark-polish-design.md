# Especificación: pulido oscuro de Mideli

Fecha: 2026-07-30

## Objetivo

Elevar todas las superficies de Mideli a una experiencia oscura, profesional y vendible para un restaurante de servicio rápido, sin alterar los flujos de pedidos, cocina, mesas, inventario, menú, personal o analíticas.

## Dirección visual

La interfaz usará un modo oscuro cálido como ambiente principal. El fondo será tinta profunda, las tarjetas serán carbón elevado y los controles usarán superficies ligeramente más claras. El rosa Mideli será el color de acción, foco y dinero. El crema será el color de lectura y marca. El dorado quedará reservado para datos secundarios y detalles premium.

La profundidad será principalmente tonal, con bordes suaves y sombras discretas. No se usarán gradientes decorativos, brillos neón ni superficies negras sin jerarquía.

## Sistema de tokens

- Canvas: `#111014`.
- Rail y superficies profundas: `#17141A`.
- Surface: `#211D24`.
- Surface elevada: `#2A242E`.
- Texto principal: `#FBF8E7`.
- Texto secundario: `#B9AEB1`.
- Borde: `#3A323D`.
- Rosa Mideli: `#F5145F`, con hover `#FF3B78`.
- Crema: `#FBF8E7`.
- Dorado: `#F6DDA4`.
- Success: `#36C275`.
- Warning: `#F3A34D`.
- Danger: `#FF667A`.

Se conservarán las familias Pacifico, Sora, Karla y JetBrains Mono. Los tokens se concentrarán en `globals.css` para que todas las pantallas compartan el mismo lenguaje.

## Superficies

- Shell: rail oscuro con navegación activa en rosa, encabezado móvil compacto y estados activos visibles.
- POS: catálogo de alto contraste, categorías compactas, tarjeta de producto clara, carrito con jerarquía de ticket y CTA rosa.
- KDS: tickets oscuros con estados semánticos y tiempos legibles.
- Analíticas: métricas principales como foco, números monoespaciados y gráficos con la paleta semántica.
- Administración: tablas, formularios, mesas e inventario con controles consistentes, estados vacíos claros y paneles sin ruido.
- Login y home: entrada de marca oscura, contraste alto y CTA único.

## Interacción y accesibilidad

- Todos los controles conservarán al menos 40px de área táctil, y los controles primarios usarán 48px.
- Se reforzará el foco visible con rosa y anillo de contraste.
- Hover, active, disabled, loading, error y success tendrán estados explícitos.
- Los textos evitarán guiones largos. Se usarán frases cortas, puntos, comas y separadores centrados cuando haga falta.
- Se respetará `prefers-reduced-motion`.
- Las superficies se revisarán en móvil, tablet, escritorio y anchos intermedios.

## Alcance técnico

- Actualizar tokens y utilidades compartidas.
- Ajustar shell de dashboard, navegación móvil y encabezados administrativos.
- Refinar componentes de POS, KDS, analíticas, menú, mesas, inventario, ajustes, login y home.
- Eliminar valores visuales aislados cuando el sistema ya tenga un token adecuado.
- No modificar esquemas, stores, acciones de Supabase ni reglas de negocio.

## Verificación

- Ejecutar detector mecánico de Impeccable sobre los archivos UI modificados.
- Ejecutar `npm run lint`.
- Ejecutar `npm run build`.
- Revisar que el contraste, el foco y la legibilidad se mantengan en las superficies principales.
