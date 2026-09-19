import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import type { Profile } from "@/types/database";

const staffRoles: Profile["role"][] = [
  "owner",
  "admin",
  "waiter",
  "kitchen",
  "supervisor",
];

function isStaffRole(value: string | null): value is Profile["role"] {
  return value !== null && staffRoles.includes(value as Profile["role"]);
}

function decodeUserName(value: string | null) {
  if (!value) return "";

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function decodeCapabilities(value: string | null) {
  if (!value) return [];
  return value
    .split(",")
    .map((capability) => capability.trim())
    .filter(Boolean);
}

function hasScopedMultibusinessContext(value: string | null) {
  return value === "available";
}

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const requestHeaders = await headers();
  const userRole = requestHeaders.get("x-mideli-role");

  if (!isStaffRole(userRole)) {
    redirect("/login");
  }

  return (
    <DashboardShell
      userName={decodeUserName(requestHeaders.get("x-mideli-user-name"))}
      userRole={userRole}
      capabilities={decodeCapabilities(
        requestHeaders.get("x-mideli-capabilities")
      )}
      multibusinessContextAvailable={hasScopedMultibusinessContext(
        requestHeaders.get("x-mideli-multibusiness-context")
      )}
      whatsappAccess={requestHeaders.get("x-mideli-whatsapp-access") === "true"}
    >
      {children}
    </DashboardShell>
  );
}
