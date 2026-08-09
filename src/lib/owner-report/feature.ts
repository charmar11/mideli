import "server-only";

export function isOwnerReportEmailEnabled() {
  return process.env.OWNER_REPORT_EMAIL_ENABLED === "true";
}

export const OWNER_REPORT_EMAIL_DISABLED_MESSAGE =
  "El envío por correo está desactivado hasta configurar un dominio verificado.";
