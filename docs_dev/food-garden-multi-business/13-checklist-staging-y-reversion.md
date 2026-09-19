# Checklist de staging y reversión

**Estado:** procedimiento preparado; no ejecutado.

Este documento evita que la primera migración multinegocio se pruebe sobre
producción o con datos personales copiados sin control.

## 1. Precondiciones

- Confirmar una versión estable del repositorio y registrar su commit.
- Confirmar que el proyecto Supabase destino es una rama Preview o una base
  separada del proyecto productivo.
- Elegir región, tamaño, persistencia y propietario del entorno sin asumirlos
  desde la configuración local.
- La rama Preview de Supabase se crea sin `--with-data`; el CLI 2.117.0 ofrece
  `--persistent` para conservarla, pero la creación aún no se ha ejecutado.
- El proyecto remoto `Mideli` está en `us-east-2`. Una vez autorizada la
  creación, el comando preparado es:

  ```powershell
  npx supabase branches create mideli-multibusiness-staging `
    --project-ref qgnjennimvbrfxvcmowb `
    --region us-east-2 --size micro --persistent
  ```

  El comando no incluye `--with-data`; aun así, no se ejecutará hasta confirmar
  la creación del recurso aislado.
- Crear un despliegue Preview de Vercel con `NEXT_PUBLIC_SUPABASE_URL` y
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` de staging, nunca de producción.
- El proyecto Vercel `mideli` ya existe, pero las variables de Supabase están
  registradas solo para Production; deben agregarse explícitamente para
  Preview con valores de staging.
- Mantener `SUPABASE_SERVICE_ROLE_KEY` únicamente en el servidor de Preview.
- Verificar que el dominio de staging no reciba webhooks de Meta, Twilio,
  Resend, Polar o el scheduler productivo.
- Definir quién puede entrar al entorno y cómo se revocará ese acceso.

## 2. Datos del entorno

La rama debe crearse sin clonar datos por defecto. Primero se aplican las
migraciones existentes y se comprueba que el esquema sea utilizable. Para las
pruebas iniciales se cargan fixtures sintéticos de Mideli, sin teléfonos,
domicilios, conversaciones, tokens, correos personales ni fotografías reales.

Si el backfill exige comparar totales reales, se debe aprobar por separado una
copia controlada. Antes de usarla hay que:

1. definir qué columnas se anonimizan;
2. limitar el acceso al entorno;
3. registrar el tiempo de conservación;
4. impedir integraciones externas y envíos de notificaciones;
5. destruir la copia al terminar la validación.

No usar `supabase branches create --with-data` como atajo sin completar esos
pasos.

## 3. Línea base antes de migrar

Registrar en staging y producción, sin exponer datos personales:

- cantidad de categorías y productos;
- cantidad de pedidos y rango de folios;
- suma de subtotales, pagos y devoluciones;
- cajas abiertas y cerradas;
- cantidad de insumos, recetas y movimientos;
- cantidad de perfiles activos;
- cantidad de zonas, mesas, clientes y domicilios como conteos agregados.

La línea base debe conservarse fuera de la aplicación para comparar después
del backfill.

## 4. Reversión de la primera rebanada

La fundación debe ser aditiva. Si falla:

1. apagar la bandera de lectura de contexto multinegocio en staging;
2. volver a la versión anterior de la aplicación en el Preview;
3. conservar las tablas nuevas y sus eventos para diagnóstico;
4. no borrar perfiles, pedidos, pagos ni historial;
5. corregir la migración en un archivo nuevo, nunca editando una migración ya aplicada;
6. repetir lint, build, dry-run y pruebas negativas antes de reintentar.

La reversión de la fundación no debe depender de `DROP TABLE`, `db reset` ni
eliminación de datos remotos.

## 5. Salida del gate

El entorno queda listo para la primera migración únicamente cuando:

- la aplicación de Preview apunta a staging;
- la base de staging no recibe eventos de producción;
- existe un respaldo o snapshot restaurable;
- el conjunto de pruebas no contiene PII no autorizada;
- el árbol de trabajo y el commit objetivo están identificados;
- `npm run lint`, `npm run build`, pruebas E2E y `npx supabase db push --linked --dry-run`
  pasan para el entorno correspondiente;
- existe evidencia de que Mideli puede regresar al flujo anterior.
