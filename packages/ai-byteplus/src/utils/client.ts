import { getApiKeyFromEnv } from '@tanstack/ai-utils'
import type { ClientOptions } from 'openai'

/**
 * BytePlus splits its APIs across two hosts with two different products,
 * two different auth headers, and two different API keys:
 *
 * - **Ark (ModelArk)** — chat, video (Seedance) and image (Seedream).
 *   `Authorization: Bearer $ARK_API_KEY`.
 * - **Seed Speech** — TTS and ASR on the voice host.
 *   `X-Api-Key: $BYTEPLUS_VOICE_API_KEY`.
 *
 * Ark keys are region-isolated: a key issued for `ap-southeast` does not work
 * against the EU host and vice versa.
 */

/**
 * Default Ark data-plane base URL (Asia-Pacific south-east).
 *
 * The EU endpoint (`https://ark.eu-west.bytepluses.com/api/v3`) serves chat
 * and image only — Seedance video is not available there.
 */
export const BYTEPLUS_ARK_BASE_URL =
  'https://ark.ap-southeast.bytepluses.com/api/v3'

/**
 * Default Seed Speech base URL. Endpoint paths are appended under
 * `/api/v3` (e.g. `/api/v3/tts/create`).
 */
export const BYTEPLUS_VOICE_BASE_URL =
  'https://voice.ap-southeast-1.bytepluses.com'

/**
 * Configuration for the Ark-hosted adapters (chat, video, image).
 *
 * Extends the OpenAI SDK's client options because the chat adapter drives the
 * OpenAI-compatible `/chat/completions` endpoint through the shared
 * `@tanstack/openai-base` adapter. `fetch` and `defaultHeaders` are inherited
 * from `ClientOptions`, and the video/image adapters — which issue plain JSON
 * requests rather than SDK calls — honour the same two fields so tests can
 * inject a fetch instead of patching the global one.
 */
export interface BytePlusArkConfig extends Omit<ClientOptions, 'apiKey'> {
  apiKey: string
}

/**
 * Configuration for the Seed Speech adapters (TTS, ASR).
 *
 * Seed Speech is not OpenAI-compatible, so this is a minimal config for
 * direct `fetch` calls rather than an OpenAI `ClientOptions` extension.
 */
export interface BytePlusVoiceConfig {
  /** Seed Speech API key — *not* the Ark key. Sent as `X-Api-Key`. */
  apiKey: string

  /** Overrides {@link BYTEPLUS_VOICE_BASE_URL}. */
  baseURL?: string

  /** Additional headers merged into every request (e.g., test ids). */
  defaultHeaders?: Record<string, string>

  /**
   * Override the underlying fetch. Defaults to the global `fetch`. Useful for
   * proxying, instrumentation, or pointing requests at a mock in tests.
   */
  fetch?: typeof fetch
}

/**
 * Gets the BytePlus Ark API key from environment variables.
 * @throws Error if ARK_API_KEY is not found
 */
export function getBytePlusArkApiKeyFromEnv(): string {
  try {
    return getApiKeyFromEnv('ARK_API_KEY')
  } catch {
    throw new Error(
      'ARK_API_KEY is required. Please set it in your environment variables or use the factory function with an explicit API key.',
    )
  }
}

/**
 * Gets the Seed Speech API key from environment variables.
 *
 * Seed Speech is a separate BytePlus product from Ark with its own key — an
 * Ark key sent as `X-Api-Key` is rejected with `45000010 Invalid X-Api-Key`.
 *
 * @throws Error if BYTEPLUS_VOICE_API_KEY is not found
 */
export function getBytePlusVoiceApiKeyFromEnv(): string {
  try {
    return getApiKeyFromEnv('BYTEPLUS_VOICE_API_KEY')
  } catch {
    throw new Error(
      'BYTEPLUS_VOICE_API_KEY is required for Seed Speech (TTS/ASR). This is a different key from ARK_API_KEY. Please set it in your environment variables or use the factory function with an explicit API key.',
    )
  }
}

/**
 * Returns an Ark client config with the default Ark base URL applied when not
 * already set.
 */
export function withBytePlusArkDefaults(
  config: BytePlusArkConfig,
): BytePlusArkConfig {
  return {
    ...config,
    baseURL: config.baseURL || BYTEPLUS_ARK_BASE_URL,
  }
}

/**
 * Returns a Seed Speech config with the default voice base URL applied (and
 * any trailing slashes trimmed) when not already set.
 */
export function withBytePlusVoiceDefaults(
  config: BytePlusVoiceConfig,
): BytePlusVoiceConfig {
  return {
    ...config,
    baseURL: (config.baseURL || BYTEPLUS_VOICE_BASE_URL).replace(/\/+$/, ''),
  }
}

/**
 * Headers for a JSON request against the Ark data plane.
 */
export function bytePlusArkHeaders(
  apiKey: string,
  extraHeaders?: Record<string, string>,
): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
    ...extraHeaders,
  }
}

/**
 * Headers for a JSON request against the Seed Speech host.
 */
export function bytePlusVoiceHeaders(
  apiKey: string,
  extraHeaders?: Record<string, string>,
): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Api-Key': apiKey,
    ...extraHeaders,
  }
}

function readStringField(value: unknown, field: string): string | undefined {
  if (typeof value !== 'object' || value === null || !(field in value)) {
    return undefined
  }
  const candidate = Reflect.get(value, field)
  if (typeof candidate === 'string') return candidate
  if (typeof candidate === 'number') return String(candidate)
  return undefined
}

/**
 * Formats an Ark error response into an `Error`.
 *
 * Ark uses the OpenAI error envelope with dotted string codes:
 * `{"error": {"code": "InvalidEndpointOrModel.NotFound", "message": "…"}}`.
 * Bodies that don't match (HTML error pages, proxy responses) fall back to
 * the raw text so the failure stays diagnosable.
 */
export function bytePlusArkError(
  status: number,
  body: unknown,
  context?: string,
): Error {
  const prefix = context ? `BytePlus Ark ${context}` : 'BytePlus Ark request'
  const error =
    typeof body === 'object' && body !== null && 'error' in body
      ? Reflect.get(body, 'error')
      : undefined
  const code = readStringField(error, 'code')
  const message = readStringField(error, 'message')
  const detail = message ?? (typeof body === 'string' ? body : undefined)
  return new Error(
    `${prefix} failed (${status}${code ? ` ${code}` : ''})${
      detail ? `: ${detail}` : ''
    }`,
  )
}

/**
 * Formats a Seed Speech error response into an `Error`.
 *
 * Seed Speech does not use the Ark envelope — it returns a flat numeric code:
 * `{"code": 45000010, "message": "Invalid X-Api-Key"}`.
 */
export function bytePlusVoiceError(
  status: number,
  body: unknown,
  context?: string,
): Error {
  const prefix = context
    ? `BytePlus Seed Speech ${context}`
    : 'BytePlus Seed Speech request'
  const code = readStringField(body, 'code')
  const message = readStringField(body, 'message')
  const detail = message ?? (typeof body === 'string' ? body : undefined)
  return new Error(
    `${prefix} failed (${status}${code ? ` ${code}` : ''})${
      detail ? `: ${detail}` : ''
    }`,
  )
}
