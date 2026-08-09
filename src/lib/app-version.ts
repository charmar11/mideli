const FALLBACK_VERSION = "0.1.0-local";

export function getPublicAppVersion() {
  const configuredVersion = process.env.NEXT_PUBLIC_APP_VERSION?.trim();
  if (configuredVersion) return configuredVersion.slice(0, 24);

  const commit = process.env.VERCEL_GIT_COMMIT_SHA?.trim();
  if (commit) return commit.slice(0, 12);

  return FALLBACK_VERSION;
}
