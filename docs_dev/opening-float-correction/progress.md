# Progreso

## 2026-08-13

- Se verificó que el valor sí existe en la base remota.
- Se identificó que la ausencia es una decisión actual de interfaz, no pérdida de datos.
- El usuario aprobó mostrar el fondo durante el conteo y corregir solo el turno abierto.
- La especificación quedó aprobada y comprometida en Git.
- Se revisaron la documentación vigente de funciones, RLS y el changelog de exposición explícita de tablas de Supabase.
- Se agregaron dos pruebas de regresión; fallaron únicamente por las funciones aún inexistentes, como se esperaba antes de implementar.
- Las siete pruebas de políticas pasan después de implementar la visibilidad y validación.
- ESLint pasa en todos los archivos TypeScript modificados.
- El dry-run remoto reconoce únicamente la migración `20260814030217_correct_opening_float.sql`.
- Se agregó la RPC transaccional, la auditoría, los tipos, el store y el flujo administrativo en Caja.
- La migración quedó aplicada y el dry-run final confirma que local y remoto están alineados.
- Una prueba transaccional actualizó y auditó temporalmente el fondo; el rollback conservó el turno #20 en $7.00 y dejó cero registros de prueba.
- El detalle remoto devuelve el arreglo de auditoría y la RPC rechaza correctamente a un mesero.
- Las 42 pruebas pasan en computadora, tablet y móvil.
- `npm run lint` y `npm run build` pasan; Serwist empaquetó 72 recursos.
- Los asesores no reportaron advertencias específicas de la tabla o RPC nuevas; permanecen advertencias preexistentes de funciones y políticas antiguas.
