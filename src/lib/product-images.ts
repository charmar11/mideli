import { createClient } from "@/lib/supabase/client";

export const PRODUCT_IMAGE_BUCKET = "menu-product-images";
export const PRODUCT_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const PRODUCT_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif";

function managedPathFromUrl(url: string | null | undefined) {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${PRODUCT_IMAGE_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index < 0) return null;
  return decodeURIComponent(url.slice(index + marker.length).split("?")[0]);
}

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("No se pudo leer la imagen. Prueba con JPG, PNG o WebP."));
    };
    image.src = url;
  });
}

export function validateProductImage(file: File) {
  const allowed = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
  if (!allowed.includes(file.type.toLowerCase())) {
    return "Selecciona una imagen JPG, PNG, WebP o HEIC.";
  }
  if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
    return "La imagen pesa más de 8 MB.";
  }
  return null;
}

export async function optimizeProductImage(file: File) {
  const validation = validateProductImage(file);
  if (validation) throw new Error(validation);

  const source = await loadImage(file);
  const ratio = 4 / 3;
  let sourceX = 0;
  let sourceY = 0;
  let sourceWidth = source.naturalWidth;
  let sourceHeight = source.naturalHeight;

  if (sourceWidth / sourceHeight > ratio) {
    sourceWidth = sourceHeight * ratio;
    sourceX = (source.naturalWidth - sourceWidth) / 2;
  } else {
    sourceHeight = sourceWidth / ratio;
    sourceY = (source.naturalHeight - sourceHeight) / 2;
  }

  const targetWidth = Math.min(1600, Math.max(640, Math.round(sourceWidth)));
  const targetHeight = Math.round(targetWidth / ratio);
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Este dispositivo no pudo preparar la imagen.");
  context.fillStyle = "#211D24";
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.drawImage(
    source,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    targetWidth,
    targetHeight
  );

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.82)
  );
  if (!blob) throw new Error("No se pudo optimizar la imagen.");
  return blob;
}

export async function uploadProductImage(productId: string, file: File) {
  const supabase = createClient();
  const blob = await optimizeProductImage(file);
  const path = `${productId}/${crypto.randomUUID()}.webp`;
  const { error } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).upload(path, blob, {
    contentType: "image/webp",
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) throw new Error(error.message || "No se pudo subir la imagen.");
  return supabase.storage.from(PRODUCT_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function removeManagedProductImage(url: string | null | undefined) {
  const path = managedPathFromUrl(url);
  if (!path) return;
  const supabase = createClient();
  const { error } = await supabase.storage.from(PRODUCT_IMAGE_BUCKET).remove([path]);
  if (error) throw new Error(error.message || "No se pudo eliminar la imagen anterior.");
}
