import { fal } from '@fal-ai/client'

export interface FalClientConfig {
  apiKey: string
  proxyUrl?: string
}

interface EnvObject {
  FAL_KEY?: string
}

interface WindowWithEnv {
  env?: EnvObject
}

function getEnvironment(): EnvObject | undefined {
  if (typeof globalThis !== 'undefined') {
    const win = (globalThis as { window?: WindowWithEnv }).window
    if (win?.env) {
      return win.env
    }
  }
  if (typeof process !== 'undefined') {
    return process.env as EnvObject
  }
  return undefined
}

export function getFalApiKeyFromEnv(): string {
  const env = getEnvironment()
  const key = env?.FAL_KEY

  if (!key) {
    throw new Error(
      'FAL_KEY is required. Please set it in your environment variables or use the factory function with an explicit API key.',
    )
  }

  return key
}

export function configureFalClient(config?: FalClientConfig): void {
  if (config?.proxyUrl) {
    fal.config({
      proxyUrl: config.proxyUrl,
    })
  } else {
    fal.config({
      credentials: config?.apiKey ?? getFalApiKeyFromEnv(),
    })
  }
}

export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`
}
