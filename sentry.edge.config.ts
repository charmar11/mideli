import * as Sentry from "@sentry/nextjs";
import {
  prepareSentryBreadcrumb,
  prepareSentryErrorEvent,
  sanitizeSentryEvent,
  sentryTracesSampler,
} from "@/lib/monitoring/sentry-privacy";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  sendDefaultPii: false,
  enableLogs: false,
  debug: false,
  maxBreadcrumbs: 30,
  tracesSampler: sentryTracesSampler,
  beforeBreadcrumb: prepareSentryBreadcrumb,
  beforeSend: prepareSentryErrorEvent,
  beforeSendTransaction: sanitizeSentryEvent,
});
