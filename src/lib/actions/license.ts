"use server";

export type LicenseActionState = {
  kind: "idle" | "success" | "error";
  message: string;
  submittedAt: number;
};

/** Legacy vendor-license controls were replaced by the Rincón business-license panel. */
export async function manageLicenseAction(): Promise<LicenseActionState> {
  return {
    kind: "error",
    message: "Este control anterior ya no está disponible. Usa la administración de licencias de Rincón 404.",
    submittedAt: Date.now(),
  };
}
