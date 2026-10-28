export function getApiKeyFromEnv(envVarName: string): string {
  const env =
    typeof globalThis !== 'undefined' && (globalThis as any).window?.env
      ? (globalThis as any).window.env
      : typeof process !== 'undefined'
        ? process.env
        : undefined

  const apiKey = env?.[envVarName]

  if (!apiKey) {
    throw new Error(
      `${envVarName} is not set. Please set the ${envVarName} environment variable or pass the API key directly.`,
    )
  }

  return apiKey
}
