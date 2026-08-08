# Findings: archivo de cortes

- Especificación aprobada: `docs/superpowers/specs/2026-08-08-archive-cash-shifts-design.md`.
- Existe un RPC histórico `delete_cash_shift(uuid)` que borra físicamente y debe dejar de ser ejecutable por usuarios autenticados.
- La interfaz principal está en `src/components/admin/cash-history-manager.tsx`.
- El estado remoto se consume desde `src/lib/stores/cash-shift-store.ts` y los contratos viven en `src/types/cash.ts`.
- La documentación actual de Supabase confirma que `GRANT` y RLS son capas separadas y que el permiso `EXECUTE` de funciones debe concederse explícitamente.
- Las funciones `SECURITY DEFINER` deben usar `search_path = ''`, referencias calificadas y comprobaciones internas de identidad y rol.
- El cambio anunciado para 2026 sobre exposición automática no afecta el enfoque: la migración declarará permisos de las funciones nuevas y revocará el RPC destructivo antiguo.
- `private.cash_shift_json` usa `to_jsonb(cash_shifts)`, por lo que las columnas de archivo llegarán automáticamente al listado y al detalle sin duplicar contratos SQL.
- `private.list_cash_shifts` ya limita el historial a roles `owner` y `admin` y devuelve hasta 200 filas; no requiere una función adicional para archivados.
- La UI puede excluir archivados en `Todos`, `Abiertos` y `Cerrados`, y mostrarlos únicamente en el nuevo filtro `Archivados`.
- El detalle actual admite cortes cerrados y conserva movimientos, cuentas transferidas, correcciones y pagos por `cash_shift_id`.
- El RPC `delete_cash_shift` desvincula y borra datos. La nueva migración debe revocar `EXECUTE` a `PUBLIC`, `anon` y `authenticated`.
- El asesor de seguridad remoto reporta advertencias preexistentes en funciones ajenas a caja y en protección de contraseñas. Las funciones nuevas usan wrapper público `SECURITY INVOKER` y lógica privilegiada en `private`.
