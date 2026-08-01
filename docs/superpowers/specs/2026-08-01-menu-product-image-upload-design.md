# Carga de imágenes de productos desde el dispositivo

Fecha: 2026-08-01

## Objetivo

Sustituir el campo de URL del editor de productos por una carga directa desde cámara, galería o archivos del dispositivo. La experiencia debe ser rápida en celular, evitar imágenes excesivamente pesadas y permitir reemplazar o retirar una fotografía sin dejar archivos abandonados.

## Enfoque aprobado

Las imágenes se almacenan en un bucket público de Supabase Storage llamado `menu-product-images`. Dueño y administrador pueden subir, reemplazar y borrar; la lectura es pública para que el menú y el POS muestren fotografías sin sesiones adicionales.

El editor ofrece:

- Selector de archivo `image/*` compatible con las opciones que presente cada dispositivo.
- Vista previa 4:3.
- Compresión automática a WebP con límite visual de 1600 px y calidad equilibrada.
- Archivo máximo de 8 MB antes de optimizar.
- Acciones `Elegir imagen`, `Cambiar` y `Quitar`.
- Indicadores de procesamiento, carga y error.
- Ausencia total de campos de URL.

Al crear un producto se guarda primero su registro, después se sube la imagen usando una ruta basada en el identificador del producto y finalmente se actualiza `image_url`. Al reemplazar, la nueva imagen se confirma antes de borrar la anterior. Al quitar o eliminar un producto, solo se borra el archivo si pertenece al bucket administrado por Mideli; las URLs históricas externas no se modifican.

## Seguridad

- Bucket público únicamente para lectura.
- Políticas de escritura y borrado basadas en perfil activo y rol `owner` o `admin`.
- MIME permitido: JPEG, PNG, WebP, HEIC y HEIF cuando Supabase lo acepte.
- Límite de Storage de 8 MB.
- Nombres generados por UUID; nunca se usa el nombre original como ruta.
- La interfaz no contiene claves privadas ni usa `service_role`.

## Errores y consistencia

- Si falla la optimización, se informa antes de guardar.
- Si el producto se creó pero falla la subida, permanece guardado sin imagen y el usuario puede reintentar.
- Si falla el borrado del archivo anterior, la nueva imagen permanece válida y se registra una advertencia no bloqueante.
- Se revocan URLs de vista previa locales al cerrar o reemplazar para evitar fugas de memoria.

## Validación

- Crear producto con y sin imagen.
- Editar y reemplazar imagen.
- Quitar imagen.
- Rechazar archivo no compatible o mayor de 8 MB.
- Verificar permisos de escritura por rol.
- Comprobar visualización en POS, menú y editor.
- Revisar celular, tableta y escritorio.
- Ejecutar lint y build antes del despliegue.
