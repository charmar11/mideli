import * as Sentry from "@sentry/nextjs";
import {
  prepareSentryBreadcrumb,
  prepareSentryErrorEvent,
  sanitizeSentryEvent,
  sentryTracesSampler,
} from "@/lib/monitoring/sentry-privacy";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  sendDefaultPii: false,
  enableLogs: false,
  debug: false,
  maxBreadcrumbs: 30,
  tracesSampler: sentryTracesSampler,
  integrations: [
    Sentry.thirdPartyErrorFilterIntegration({
      filterKeys: ["mideli"],
      behaviour: "drop-error-if-exclusively-contains-third-party-frames",
      ignoreSentryInternalFrames: true,
    }),
  ],
  beforeBreadcrumb: prepareSentryBreadcrumb,
  beforeSend: prepareSentryErrorEvent,
  beforeSendTransaction: sanitizeSentryEvent,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
