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
    const apiKey = config?.apiKey ?? getFalApiKeyFromEnv()
    if (!apiKey) {
      throw new Error('API key is required')
    }
    fal.config({
      credentials: apiKey,
    })
  }
}

export function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`
}

/**
 * Convert an ArrayBuffer to base64 in a cross-runtime way.
 *
 * The naive `btoa(String.fromCharCode(...bytes))` form blows up V8's argument
 * limit (~65k) on realistic audio payloads, so we either use `Buffer` (Node /
 * Bun) or walk the byte array in a single loop (browser).
 */
export function arrayBufferToBase64(bytes: ArrayBuffer): string {
  if (typeof Buffer !== 'undefined' && typeof Buffer.from === 'function') {
    return Buffer.from(bytes).toString('base64')
  }
  const view = new Uint8Array(bytes)
  let binary = ''
  for (let i = 0; i < view.byteLength; i += 1) {
    binary += String.fromCharCode(view[i]!)
  }
  return btoa(binary)
}
