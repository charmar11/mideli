import { headers } from "next/headers";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const requestHeaders = await headers();
  const role = requestHeaders.get("x-mideli-role");

  redirect(role === "kitchen" ? "/dashboard/cocina" : "/dashboard/mesero");
}
