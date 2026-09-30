import { NextResponse } from "next/server";
import sharp from "sharp";
import { BUSINESS_BRAND_ASSET_BUCKET, MAX_BUSINESS_LOGO_BYTES } from "@/lib/business-branding";
import { requirePlatformManager } from "@/lib/server/platform-manager";

export const runtime = "nodejs";

const MAX_OUTPUT_BYTES = 3 * 1024 * 1024;
const MAX_REQUEST_BYTES = MAX_BUSINESS_LOGO_BYTES + 128 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const ALLOWED_FORMATS = new Set(["png", "jpeg", "webp"]);

function jsonError(message: string, status: number) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return jsonError("No se pudo validar el origen de la solicitud", 403);
  }
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null) {
    const requestBytes = Number(contentLength);
    if (!Number.isSafeInteger(requestBytes) || requestBytes < 0 || requestBytes > MAX_REQUEST_BYTES) {
      return jsonError("La solicitud supera el tamaño permitido", 413);
    }
  }

  try {
    const { actorId, admin } = await requirePlatformManager();
    const form = await request.formData();
    const businessId = String(form.get("businessId") ?? "").trim();
    const operation = String(form.get("operation") ?? "upload");

    if (!UUID_PATTERN.test(businessId)) {
      return jsonError("Selecciona un negocio válido", 400);
    }
    if (operation !== "upload" && operation !== "remove") {
      return jsonError("La acción del logo no es válida", 400);
    }

    const { data: business, error: businessError } = await admin
      .from("businesses")
      .select("id,organization_id,display_name,lifecycle_status,brand_logo_path")
      .eq("id", businessId)
      .maybeSingle();
    if (businessError || !business || business.lifecycle_status === "retired") {
      return jsonError("No se encontró un negocio editable", 404);
    }

    const previousPath = business.brand_logo_path;
    let nextPath: string | null = null;
    let optimizedLogo: Buffer | null = null;

    if (operation === "upload") {
      const logo = form.get("logo");
      if (!(logo instanceof File) || logo.size === 0) {
        return jsonError("Selecciona una imagen de logo", 400);
      }
      if (logo.size > MAX_BUSINESS_LOGO_BYTES || !ALLOWED_TYPES.has(logo.type)) {
        return jsonError("Usa un logo PNG, JPG o WebP de hasta 4 MB", 400);
      }

      const source = Buffer.from(await logo.arrayBuffer());
      let metadata: { format?: string; width?: number; height?: number };
      try {
        metadata = await sharp(source, { limitInputPixels: 16_000_000, failOn: "error" }).metadata();
      } catch {
        return jsonError("El archivo no parece ser un logo PNG, JPG o WebP válido", 400);
      }
      if (
        !metadata.format ||
        !ALLOWED_FORMATS.has(metadata.format) ||
        metadata.format !== (logo.type === "image/jpeg" ? "jpeg" : logo.type.slice("image/".length)) ||
        !metadata.width ||
        !metadata.height ||
        metadata.width > 8000 ||
        metadata.height > 8000
      ) {
        return jsonError("El archivo no parece ser un logo PNG, JPG o WebP válido", 400);
      }

      try {
        optimizedLogo = await sharp(source, { limitInputPixels: 16_000_000, failOn: "error" })
          .rotate()
          .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 88, effort: 4 })
          .toBuffer();
      } catch {
        return jsonError("No se pudo procesar este logo. Prueba con otra imagen", 400);
      }
      if (optimizedLogo.byteLength > MAX_OUTPUT_BYTES) {
        return jsonError("El logo no se pudo comprimir lo suficiente. Prueba con una imagen más pequeña", 400);
      }
      nextPath = `${businessId}/${crypto.randomUUID()}.webp`;
    }

    if (optimizedLogo && nextPath) {
      const { error: uploadError } = await admin.storage
        .from(BUSINESS_BRAND_ASSET_BUCKET)
        .upload(nextPath, optimizedLogo, {
          contentType: "image/webp",
          cacheControl: "31536000",
          upsert: false,
        });
      if (uploadError) {
        return jsonError("No se pudo guardar el logo", 500);
      }
    }

    const { error: updateError } = await admin
      .from("businesses")
      .update({ brand_logo_path: nextPath, updated_at: new Date().toISOString() })
      .eq("id", businessId);
    if (updateError) {
      if (nextPath) {
        await admin.storage.from(BUSINESS_BRAND_ASSET_BUCKET).remove([nextPath]);
      }
      return jsonError("No se pudo actualizar el logo del negocio", 500);
    }

    const { error: auditError } = await admin.from("audit_events").insert({
      actor_user_id: actorId,
      organization_id: business.organization_id,
      business_id: businessId,
      action: "updated",
      entity_type: "business",
      entity_id: businessId,
      reason: operation === "remove"
        ? "Logo del negocio eliminado desde la administración de plataforma"
        : "Logo del negocio actualizado desde la administración de plataforma",
      metadata: { changed_fields: ["brand_logo_path"], operation },
    });

    if (previousPath?.startsWith(`${businessId}/`) && previousPath !== nextPath) {
      await admin.storage.from(BUSINESS_BRAND_ASSET_BUCKET).remove([previousPath]);
    }

    return NextResponse.json({
      success: true,
      path: nextPath,
      warning: auditError ? "El logo se guardó, pero no se pudo confirmar su auditoría" : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "No autenticado" || message === "No tienes permisos para administrar negocios") {
      return jsonError(message, 403);
    }
    return jsonError("No se pudo actualizar el logo. Intenta de nuevo", 500);
  }
}
