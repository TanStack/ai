export function getPerplexityApiKeyFromEnv(): string {
  const env = getEnvironment()
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

interface WindowWithEnv {
  env?: Record<string, string | undefined>
}

function getEnvironment(): Record<string, string | undefined> | undefined {
  if (typeof globalThis !== 'undefined') {
    const win = (globalThis as { window?: WindowWithEnv }).window
    if (win?.env) return win.env
  }
  if (typeof process !== 'undefined') {
    return process.env
  }
  return undefined
}
