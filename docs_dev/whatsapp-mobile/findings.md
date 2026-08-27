# Hallazgos

- La navegación principal usa `overflow-x-auto`, por lo que en teléfonos funciona como carrusel horizontal.
- Clientes alterna correctamente entre directorio y ficha, pero su contenedor y varias filas no fijan `min-width: 0` ni `max-width: 100%` en todos los niveles.
- Los importes del directorio compiten horizontalmente con nombre y teléfono.
- El historial mantiene folio, estado, total y chevron en una sola fila, lo que puede desbordar en pantallas angostas.
- Formularios y acciones de domicilios necesitan apilarse por debajo de `sm`.
- La bandeja también usa un carrusel para filtros y debe caber sin desplazamiento horizontal.
- El sistema visual existente ya define el patrón móvil de lista o detalle, controles de 44 px y superficies oscuras con bordes sutiles.
- La navegación compacta conserva etiquetas e iconos incluso a 320 px sin carrusel.
- El chat mantiene el compositor y el regreso visibles a 320 px.
- El único elemento detectado fuera del viewport durante Clientes fue el contenedor de alertas de la prueba sin sesión; no aumentó el ancho del documento y no pertenece al layout de WhatsApp.
