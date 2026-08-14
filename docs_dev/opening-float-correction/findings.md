# Hallazgos

- El turno remoto abierto es el número 20 y tiene `opening_float = 7.00`.
- La apertura ya guarda `opening_float` mediante `open_cash_shift`.
- El resumen operativo oculta actualmente el fondo junto con el efectivo esperado.
- Después de `Comparar conteo`, el desglose ya muestra el fondo como primera línea.
- `private.cash_shift_totals` usa `cash_shifts.opening_float` para calcular el efectivo esperado.
- `/settings/caja` ya lista turnos abiertos y muestra su detalle, pero no ofrece corrección del fondo.
- Las correcciones de cortes cerrados usan otra semántica y no deben reutilizarse para este cambio.
- La documentación vigente de Supabase recomienda `SECURITY INVOKER` por defecto; cuando una RPC necesita `SECURITY DEFINER`, exige `search_path` seguro y nombres de esquema explícitos.
- Supabase concede ejecución de funciones ampliamente por defecto, por lo que la nueva RPC debe revocar `PUBLIC` y `anon`, y otorgar únicamente a `authenticated`.
- La tabla de auditoría expuesta en `public` debe tener RLS y una política de lectura limitada a quien ya puede consultar el turno.
- El changelog del 28 de abril de 2026 confirma que tablas nuevas en `public` necesitan `GRANT` explícito para ser visibles por Data API; la migración incluirá `GRANT SELECT` únicamente para `authenticated`.
- No hay cambios recientes de Supabase que impidan la RPC transaccional propuesta.
