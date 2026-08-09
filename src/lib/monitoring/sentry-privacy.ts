import type {
  Breadcrumb,
  Event,
  EventHint,
  ErrorEvent,
} from "@sentry/nextjs";

type SentrySamplingContext = {
  name: string;
  attributes?: Record<string, unknown>;
  location?: { pathname?: string };
  normalizedRequest?: { url?: string };
  inheritOrSampleWith: (fallbackSampleRate: number) => number;
};

const EXTENSION_OR_INJECTED_CODE =
  /(?:chrome|moz|safari-web)-extension:|webkit-masked-url:|\buncode\/blocker\b|\bblocker\.(?:frame|install)\b/i;
const EXTENSION_PERMISSION_ERROR =
  /permission denied to access property ["']?(?:correspondinguseelement|src|nodetype)["']?/i;
const SENSITIVE_KEY =
  /authorization|cookie|customer|email|mesa|nota|note|order|password|pedido|phone|request|response|secret|session|table|token|user|zona/i;
const SENSITIVE_UI_TARGET = /input|textarea|contenteditable|password/i;
const SAFE_SPAN_KEYS = new Set([
  "http.request.method",
  "http.response.status_code",
  "http.route",
  "sentry.op",
  "sentry.origin",
  "url.path",
]);
const SAFE_CONTEXT_KEYS = new Set(["browser", "os", "react", "runtime", "trace"]);
const REMOVED_INTEGRATIONS = new Set(["Context", "CultureContext"]);

export function createSentryDataCollection() {
  return {
    userInfo: false,
    cookies: false,
    httpHeaders: {
      request: false,
      response: false,
    },
    httpBodies: [],
    urlQueryParams: false,
    graphQL: {
      document: false,
      variables: false,
    },
    genAI: {
      inputs: false,
      outputs: false,
    },
    databaseQueryData: false,
    stackFrameVariables: false,
    frameContextLines: 5,
  };
}

export function filterSentryPrivacyIntegrations<T extends { name: string }>(
  integrations: T[]
): T[] {
  return integrations.filter(({ name }) => !REMOVED_INTEGRATIONS.has(name));
}

function redactLocalPath(value: string): string {
  return value
    .replace(/([A-Z]:[\\/]Users[\\/])[^\\/]+/gi, "$1[usuario]")
    .replace(/([\\/](?:home|Users)[\\/])[^\\/]+/g, "$1[usuario]");
}

function sanitizeUrl(value: string): string {
  const withoutQuery = redactLocalPath(value.split(/[?#]/, 1)[0] ?? value);

  if (!/^https?:\/\//i.test(value)) {
    return withoutQuery;
  }

  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return withoutQuery;
  }
}

function redactText(value: string): string {
  return value
    .replace(/https?:\/\/[^\s?#]+(?:\?[^\s#]*)?(?:#[^\s]*)?/gi, (url) => sanitizeUrl(url))
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[correo]")
    .replace(/\b(?:sbp_|sntrys_|Bearer\s+)[A-Za-z0-9._-]+\b/gi, "[secreto]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[token]")
    .replace(/\b\d{8,}\b/g, "[numero]");
}

function sanitizeBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  const category = breadcrumb.category?.toLowerCase() ?? "";

  if (category === "console" || category.includes("ui.input")) {
    return null;
  }

  if (category.includes("ui.click")) {
    const target = `${breadcrumb.message ?? ""} ${JSON.stringify(breadcrumb.data ?? {})}`;
    if (SENSITIVE_UI_TARGET.test(target)) {
      return null;
    }

    return {
      ...breadcrumb,
      message: undefined,
      data: undefined,
    };
  }

  const safeData: Record<string, unknown> = {};
  const data = breadcrumb.data ?? {};

  for (const key of ["method", "status_code"] as const) {
    if (data[key] !== undefined) {
      safeData[key] = data[key];
    }
  }

  for (const key of ["url", "from", "to"] as const) {
    if (typeof data[key] === "string") {
      safeData[key] = sanitizeUrl(data[key]);
    }
  }

  return {
    ...breadcrumb,
    message: breadcrumb.message ? redactText(breadcrumb.message) : undefined,
    data: Object.keys(safeData).length > 0 ? safeData : undefined,
  };
}

function isInjectedExtensionError(event: ErrorEvent, hint: EventHint): boolean {
  const exceptionText = event.exception?.values?.map((value) => value.value ?? "").join(" ") ?? "";
  const originalStack = hint.originalException instanceof Error ? hint.originalException.stack ?? "" : "";
  const originalMessage =
    hint.originalException instanceof Error
      ? hint.originalException.message
      : String(hint.originalException ?? "");
  const combinedText = `${event.message ?? ""} ${exceptionText} ${originalMessage}`;

  if (!EXTENSION_PERMISSION_ERROR.test(combinedText)) {
    return false;
  }

  const frames = event.exception?.values?.flatMap((value) => value.stacktrace?.frames ?? []) ?? [];
  const hasFirstPartyFrame = frames.some((frame) => frame.in_app === true);
  const frameOrigins = frames.map((frame) => frame.filename ?? "").join(" ");

  return !hasFirstPartyFrame && EXTENSION_OR_INJECTED_CODE.test(`${frameOrigins} ${originalStack}`);
}

export function sanitizeSentryEvent<T extends Event>(event: T): T {
  event.user = { ip_address: "0.0.0.0" };
  event.extra = undefined;
  event.server_name = undefined;
  event.tags = {
    ...event.tags,
    privacy_mode: "strict",
  };

  if (event.request) {
    event.request = {
      method: event.request.method,
      url: event.request.url ? sanitizeUrl(event.request.url) : undefined,
    };
  }

  if (event.contexts) {
    for (const key of Object.keys(event.contexts)) {
      if (!SAFE_CONTEXT_KEYS.has(key) || SENSITIVE_KEY.test(key)) {
        delete event.contexts[key];
      }
    }
  }

  if (event.tags) {
    for (const key of Object.keys(event.tags)) {
      if (SENSITIVE_KEY.test(key)) {
        delete event.tags[key];
      } else if (typeof event.tags[key] === "string") {
        event.tags[key] = redactText(event.tags[key]);
      }
    }
  }

  if (event.message) {
    event.message = redactText(event.message);
  }

  if (event.logentry) {
    event.logentry = {
      message: event.logentry.message ? redactText(event.logentry.message) : undefined,
      params: undefined,
    };
  }

  if (event.transaction) {
    event.transaction = redactText(event.transaction);
  }

  for (const exception of event.exception?.values ?? []) {
    if (exception.value) {
      exception.value = redactText(exception.value);
    }

    for (const frame of exception.stacktrace?.frames ?? []) {
      if (frame.filename) {
        frame.filename = sanitizeUrl(frame.filename);
      }
      if (frame.abs_path) {
        frame.abs_path = sanitizeUrl(frame.abs_path);
      }
      frame.vars = undefined;
    }
  }

  for (const image of event.debug_meta?.images ?? []) {
    if (image.code_file) {
      image.code_file = sanitizeUrl(image.code_file);
    }
  }

  event.breadcrumbs = event.breadcrumbs
    ?.map(sanitizeBreadcrumb)
    .filter((breadcrumb): breadcrumb is Breadcrumb => breadcrumb !== null);

  for (const span of event.spans ?? []) {
    const safeData = Object.fromEntries(
      Object.entries(span.data).filter(([key]) => SAFE_SPAN_KEYS.has(key))
    );
    span.data = safeData;
    if (span.description) {
      span.description = redactText(span.description);
    }
  }

  return event;
}

export function prepareSentryErrorEvent(event: ErrorEvent, hint: EventHint): ErrorEvent | null {
  if (isInjectedExtensionError(event, hint)) {
    return null;
  }

  return sanitizeSentryEvent(event);
}

export function prepareSentryBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  return sanitizeBreadcrumb(breadcrumb);
}

export function sentryTracesSampler({
  name,
  attributes,
  location,
  normalizedRequest,
  inheritOrSampleWith,
}: SentrySamplingContext): number {
  const route = [
    normalizedRequest?.url,
    location?.pathname,
    attributes?.["http.route"],
    attributes?.["url.path"],
    name,
  ].find((candidate): candidate is string => typeof candidate === "string");

  if (route && sanitizeUrl(route).includes("/api/health")) {
    return 0;
  }

  return inheritOrSampleWith(process.env.NODE_ENV === "development" ? 1 : 0.1);
}
