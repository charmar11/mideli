# Findings: pagos, navegación y categorías

- La corrección actual existe en `payment-method-correction-dialog.tsx`, pero solo es visible desde un icono dentro de tickets y está limitada a owner y admin.
- `payment_tender_method_changes` registra el cambio, pero todavía no distingue al solicitante del autorizador.
- `private.staff_authorization_pins` y el flujo de descuentos ya ofrecen PIN, bloqueo por intentos y tokens de un solo uso.
- Los cortes cerrados guardan snapshots de totales. Deben conservarse y explicar correcciones posteriores mediante ajustes auditables.
- `dashboard-shell.tsx` construye una lista plana para sidebar, header de tablet y navegación inferior móvil.
- El orden de categorías ya se consume desde `categories.sort_order` en Menú y POS.
- `category-manager.tsx` muestra un asa visual que todavía no tiene comportamiento.
- La documentación actual de Supabase recomienda RLS en esquemas expuestos, permisos explícitos y funciones `SECURITY DEFINER` fuera del esquema expuesto con `search_path` seguro.
- La documentación oficial de dnd kit ofrece sensores de mouse, toque y teclado, además de coordenadas específicas para listas ordenables.
- El detalle de Historial ya conoce el rol actual y abre tickets por pedido; la acción nueva puede reutilizar ese flujo sin una consulta paralela.
- `listPaymentAuthorizersAction` ya devuelve propietarios y administradores activos para el selector de PIN.
- Los ajustes de corte aceptan método, dirección, monto, creador y autorizador, suficiente para registrar dos reclasificaciones en un corte cerrado.
- La navegación actual usa la misma lista plana en tres composiciones responsivas; conviene separar datos de operación, Administración y Control antes de renderizar.
- El proyecto todavía no incluye una biblioteca de arrastre. La opción oficial de dnd kit cubre mouse, toque y teclado sin mantener lógica de puntero propia.
- Las versiones estables consultadas son `@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10.0.0 y `@dnd-kit/utilities` 3.2.2; aceptan React 19 mediante sus peer dependencies.
- Base UI 1.6 ya incluye primitivas Menu, Collapsible y Drawer, por lo que la navegación agrupada no necesita otra biblioteca.
- La política histórica `Categories managed by admins` usa `USING (true)`, lo que deja el borrado sin una comprobación de administrador. La migración de ordenamiento debe corregirla porque afecta el mismo recurso.
- `private.active_profile_role()` ya valida que el perfil siga activo y está disponible para las funciones internas y políticas autenticadas.
- La función existente de ajustes exige una autorización separada. La corrección automática debe insertar su par de reclasificaciones dentro de la misma función segura, usando al autorizador ya validado.
- El store del catálogo puede publicar el orden nuevo de forma optimista y restaurar la referencia anterior si el RPC falla.
- El `sort_order` ya alimenta tanto Menú como POS, por lo que guardar el orden en categorías actualiza ambas vistas sin duplicar lógica.
- `npm audit --omit=dev` reporta dependencias transitivas vulnerables que ya existían en el árbol; no provienen de dnd kit y requieren una actualización de dependencias separada para no mezclar riesgos.

## Cierre v0.9 piloto

- La rama local `main` contiene tres commits que todavía no están en `origin/main`, además de la implementación verificada sin commit.
- El despliegue de producción está listo en `https://mideli.vercel.app`.
- La base remota está alineada hasta la migración `20260808160831`.
- El contexto maestro estaba desactualizado en Next.js, migraciones, corrección de pagos, navegación y orden de categorías.
- La siguiente inversión de producto debe empezar por pruebas reales, monitoreo, respaldos y contingencia sin internet.
- El reporte diario del dueño es la mejora comercial con mejor relación entre valor visible y complejidad después de estabilizar la operación.
