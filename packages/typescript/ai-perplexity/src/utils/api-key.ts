/**
 * Resolve a Perplexity API key from environment variables.
 *
 * Honors `PERPLEXITY_API_KEY` first, then falls back to `PPLX_API_KEY`.
 * Throws if neither is set.
 */
export function getPerplexityApiKeyFromEnv(): string {
  const env =
    typeof globalThis !== 'undefined' && (globalThis as any).window?.env
      ? (globalThis as any).window.env
      : typeof process !== 'undefined'
        ? process.env
        : undefined

  const key = [env?.PERPLEXITY_API_KEY, env?.PPLX_API_KEY]
    .find(
      (value): value is string =>
        typeof value === 'string' && value.trim().length > 0,
    )
    ?.trim()

  if (!key) {
    throw new Error(
      'PERPLEXITY_API_KEY (or PPLX_API_KEY) is required. Set it in your environment or pass an explicit apiKey.',
    )
  }

  return key
}
