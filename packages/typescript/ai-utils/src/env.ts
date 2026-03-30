export function getApiKeyFromEnv(envVarName: string): string {
  let apiKey: string | undefined

  if (typeof process !== 'undefined' && process.env) {
    apiKey = process.env[envVarName]
  }

  if (
    !apiKey &&
    typeof window !== 'undefined' &&
    (window as any).env
  ) {
    apiKey = (window as any).env[envVarName]
  }

  if (!apiKey) {
    throw new Error(
      `${envVarName} is not set. Please set the ${envVarName} environment variable or pass the API key directly.`
    )
  }

  return apiKey
}
