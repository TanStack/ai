import { generateId as _generateId, getApiKeyFromEnv } from '@tanstack/ai-utils'
import { TwelveLabs } from 'twelvelabs-js'

/**
 * Configuration for constructing a TwelveLabs client.
 */
export interface TwelveLabsClientConfig {
  /** Your TwelveLabs API key. */
  apiKey: string
}

/**
 * Creates a TwelveLabs SDK client instance.
 */
export function createTwelveLabsClient(
  config: TwelveLabsClientConfig,
): TwelveLabs {
  return new TwelveLabs({ apiKey: config.apiKey })
}

/**
 * Reads the TwelveLabs API key from the environment.
 *
 * Looks for `TWELVELABS_API_KEY` first, then the SDK-native
 * `TWELVE_LABS_API_KEY` spelling.
 *
 * @throws Error if neither variable is set.
 */
export function getTwelveLabsApiKeyFromEnv(): string {
  try {
    return getApiKeyFromEnv('TWELVELABS_API_KEY')
  } catch {
    try {
      return getApiKeyFromEnv('TWELVE_LABS_API_KEY')
    } catch {
      throw new Error(
        'TWELVELABS_API_KEY (or TWELVE_LABS_API_KEY) is not set. Please set one of these environment variables or pass the API key directly.',
      )
    }
  }
}

/**
 * Generates a unique ID with a prefix.
 */
export function generateId(prefix: string): string {
  return _generateId(prefix)
}
