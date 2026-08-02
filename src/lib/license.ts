export const APP_LICENSE_ID = 1;

export type AppLicenseRecord = {
  id: number;
  status: "active" | "suspended";
  valid_until: string;
  updated_at: string;
};

export type AppLicenseSnapshot = {
  state: "active" | "expired" | "suspended" | "unavailable";
  isActive: boolean;
  validUntil: string | null;
  updatedAt: string | null;
};

export function resolveLicense(
  record: AppLicenseRecord | null | undefined,
  now = Date.now()
): AppLicenseSnapshot {
  if (!record) {
    return {
      state: "unavailable",
      isActive: true,
      validUntil: null,
      updatedAt: null,
    };
  }

  if (record.status === "suspended") {
    return {
      state: "suspended",
      isActive: false,
      validUntil: record.valid_until,
      updatedAt: record.updated_at,
    };
  }

  const isActive = new Date(record.valid_until).getTime() > now;
  return {
    state: isActive ? "active" : "expired",
    isActive,
    validUntil: record.valid_until,
    updatedAt: record.updated_at,
  };
}
