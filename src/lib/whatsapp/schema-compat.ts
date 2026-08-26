type DatabaseLikeError = {
  code?: string | null;
};

export function isMissingWhatsappSchema(error: DatabaseLikeError | null | undefined) {
  return Boolean(
    error && ["PGRST205", "42P01", "42703", "42883"].includes(error.code ?? "")
  );
}
