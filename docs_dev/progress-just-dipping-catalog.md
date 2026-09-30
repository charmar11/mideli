# Progress: catálogo Just Dipping

## 2026-09-26

- Diseño funcional acordado con el usuario para la configuración de venta por producto y combos.
- Diseño documentado en `docs/superpowers/specs/2026-09-26-just-dipping-combo-catalog-design.md`, commit `48c6565`.
- Confirmado que el flujo debe integrarse con Administrar > Menú y soportar productos agregados en el futuro.
- Se implementaron modos de venta editables, el constructor de combos, componentes elegibles y marca de regalo en el POS.
- El backend reemplaza el marcador de regalo enviado por navegador con la configuración guardada del combo y rechaza la venta individual combo-only.
- Se importó el catálogo sólo a Just Dipping. Producción verifica 7 categorías, 28 productos vinculados, 27 activos y 3 combos. Regular Box conservó su fila existente y quedó enlazada por ID de origen.
- Promo Lunes incluye el cheesecake como regalo y sin línea de venta separada; conserva el precio de $150.
- Las cajas abiertas se mantuvieron en 2. No se tocaron pedidos, pagos, inventario, recetas, turnos ni catálogo de Mideli.
- `npm run lint`, `npm run build` y el detector Impeccable terminaron correctamente. `supabase db advisors` mostró avisos generales del proyecto.
- pgTAP no pudo correr porque `supabase test db --linked` requiere Docker/Podman. Se realizaron comprobaciones SQL de sólo lectura en producción.
- Playwright verificó el login móvil local; no se abrió una sesión autenticada, por lo que el modal POS de combos no se ejercitó visualmente en navegador.
- Deploy real completado: `dpl_BY2ENwrXkfktnPEEJ74scUJBLz7Y`, `Ready`, alias `https://mideli.vercel.app`.
- `/api/health` respondió HTTP 200. Playwright abrió `/login` en producción sin errores ni advertencias de consola.
- Sigue pendiente una prueba operativa con sesión autenticada de mesero para recorrer cada combo hasta impresión/cocina. No se dispuso de una sesión de prueba segura.
- Los productos importados todavía no tienen las imágenes Firebase; se muestran con el fallback del catálogo.
