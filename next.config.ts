import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { withSerwist } from "@serwist/turbopack";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
};

const serwistConfig = withSerwist(nextConfig);

export default withSentryConfig(serwistConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: true,
  telemetry: false,
  applicationKey: "mideli",
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
    excludeReplayIframe: true,
    excludeReplayShadowDom: true,
    excludeReplayWorker: true,
  },
});
