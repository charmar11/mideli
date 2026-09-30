import { PlatformAccessScreen } from "@/components/auth/platform-access-screen";

function safeRedirect(value: string | undefined) {
  if (!value?.startsWith("/") || value.startsWith("//")) return "/dashboard";
  return value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const params = await searchParams;

  return <PlatformAccessScreen redirectTo={safeRedirect(params.next)} />;
}
