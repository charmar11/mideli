export const SUPABASE_SESSION_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax",
  maxAge: 400 * 24 * 60 * 60,
  secure: process.env.NODE_ENV === "production",
} as const;
