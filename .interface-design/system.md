# Sistema de interfaz de Mideli

## Dirección

Mideli se siente como una herramienta de servicio nocturno: cálida, compacta y operativa. La interfaz debe ayudar a decidir y actuar durante un turno, no parecer un tablero administrativo genérico.

## Profundidad y superficies

- Estrategia principal: cambios sutiles de superficie con bordes de baja intensidad.
- Canvas `background`, panel `surface`, controles y bloques internos `surface-raised`.
- Sombras solo en elementos flotantes y menús. En paneles permanentes manda el borde.
- Radios: 8 px en controles, 12 px en filas y 16 px en paneles.

## Jerarquía

- Sora para títulos, etiquetas y acciones.
- Karla para conversación y explicación.
- JetBrains Mono para folios, teléfonos, dinero, hora y cantidades.
- El contenido operativo gana por peso y contraste; la metadata baja a texto pequeño y muted.
- Rosa significa selección o marca. Verde significa completar o continuar. Ámbar significa atención. Rojo se reserva para fallos y acciones irreversibles.

## Densidad

- Unidad base: 4 px.
- Controles táctiles: mínimo 44 px.
- Paneles operativos: 12 a 16 px de padding.
- Secciones administrativas: 16 a 20 px.
- Movimiento breve, solo transformaciones y opacidad. Sin animaciones en acciones repetidas.

## Patrones reutilizables

### Bandeja operativa

- Escritorio: cola, trabajo principal y ficha contextual.
- Tableta: cola y trabajo principal; el contexto se despliega dentro del trabajo.
- Móvil: cola o trabajo principal, nunca ambos apilados.
- Las filas se ordenan por urgencia y luego por actividad.

### Ficha de comanda

- Folio y estado arriba.
- Productos en una línea compacta por concepto.
- Total dentro de una superficie inset.
- Domicilio, referencia y pago juntos.
- Copiar y abrir mapa son acciones hermanas de 44 px.

### Conversación

- Entrante a la izquierda sobre `surface`.
- Saliente a la derecha con `brand`.
- Fallido usa fondo danger tenue y texto explícito.
- El compositor se mantiene al final y respeta el área segura del dispositivo.
- El scroll automático solo actúa al abrir o cuando la persona ya estaba al final.
