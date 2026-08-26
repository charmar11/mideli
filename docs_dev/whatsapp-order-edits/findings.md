# Findings

- `handlePendingModifiers` guarda una sola selección para todo el renglón agregado.
- `mergeModifiers` reemplaza la opción previa cuando el grupo es de selección única.
- El mensaje `uno de res y los otros de camarón` terminó persistido como cantidad 3 con opción Res.
- `handleOrdering` procesa primero el producto y pierde la intención `para domicilio` del mismo mensaje.
- Las 13 tarifas de 0 a 15 km y 8 recargos por colonia están activas.
- `whatsapp_channel_settings.delivery_quotes_enabled` está activado.
- El origen del local ya tiene dirección y coordenadas verificadas mediante Google Maps.
- `create_orders_enabled` está en `false`.
- La cotización desactivada retorna antes de crear un registro diagnóstico.
- El bot ya permite retirar productos y cambiar cantidades en casos simples, pero no sustituciones ni variaciones por unidad.
- Google puede devolver una coincidencia parcial para direcciones incompletas; el flujo conserva un segundo intento y después deriva a atención humana.
- La creación automática exige dos controles independientes: variable de servidor y configuración de base de datos.
