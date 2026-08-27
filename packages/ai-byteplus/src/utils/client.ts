import { getApiKeyFromEnv } from '@tanstack/ai-utils'
import type { ClientOptions } from 'openai'

/**
 * Default Ark data-plane base URL (Asia-Pacific south-east).
 *
 * Per the BytePlus docs the EU endpoint
 * (`https://ark.eu-west.bytepluses.com/api/v3`) serves chat and image only —
 * Seedance video is not available there. Docs-derived: only the ap-southeast
 * host was exercised live.
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
 *
 * Two inherited fields differ in reach, because the fetch-based adapters have
 * no SDK to delegate to:
 * - `timeout` is honoured everywhere — the fetch-based adapters convert it to
 *   an `AbortSignal` (see {@link bytePlusTimeoutSignal}).
 * - `maxRetries` applies to the **chat adapter only**. The video, image and
 *   speech adapters do not retry; video polling is driven by core's loop,
 *   which owns its own retry policy.
 */
export interface BytePlusArkConfig extends Omit<ClientOptions, 'apiKey'> {
  /** Seed Speech API key — *not* the Ark key. Sent as `X-Api-Key`. */
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
 * Gets the BytePlus Ark API key from environment variables, preferring
 * `ARK_API_KEY` and falling back to `BYTEPLUS_API_KEY`.
 * @throws Error if neither variable is set
 */
export function getBytePlusArkApiKeyFromEnv(): string {
  try {
    return getApiKeyFromEnv('ARK_API_KEY')
  } catch {
    try {
      return getApiKeyFromEnv('BYTEPLUS_API_KEY')
    } catch {
      throw new Error(
        'ARK_API_KEY or BYTEPLUS_API_KEY is required. Please set one of these environment variables or use the factory function with an explicit API key.',
      )
    }
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
 * already set, and any trailing slashes trimmed so path joins stay
 * single-slashed.
 *
 * The returned `baseURL` is always a string: adapters that build request paths
 * by interpolation can use it directly without re-applying a default (which
 * would otherwise risk interpolating `undefined` into a URL). The config's own
 * type is preserved, so adapter-specific config fields survive the call.
 */
export function withBytePlusArkDefaults<TConfig extends BytePlusArkConfig>(
  config: TConfig,
): Omit<TConfig, 'baseURL'> & { /** Overrides {@link BYTEPLUS_VOICE_BASE_URL}. */
baseURL: string } {
  return {
    ...config,
    baseURL: (config.baseURL || BYTEPLUS_ARK_BASE_URL).replace(/\/+$/, ''),
  }
}

/**
 * Returns a Seed Speech config with the default voice base URL applied (and
 * any trailing slashes trimmed) when not already set.
 *
 * As with {@link withBytePlusArkDefaults}, the returned `baseURL` is always a
 * string, so adapters can interpolate it without re-applying a fallback, and
 * the config's own type is preserved.
 */
export function withBytePlusVoiceDefaults<TConfig extends BytePlusVoiceConfig>(
  config: TConfig,
): Omit<TConfig, 'baseURL'> & { baseURL: string } {
  return {
    ...config,
    baseURL: (config.baseURL || BYTEPLUS_VOICE_BASE_URL).replace(/\/+$/, ''),
  }
}

/**
 * Normalizes the OpenAI-shaped `defaultHeaders` config field (which accepts a
 * `Headers` instance, an entry list, or a record with nullable values) into
 * the plain record the header builders below take. Non-string values are
 * dropped rather than serialized.
 *
 * Shared by every fetch-based adapter (image, video, speech): they all read
 * `defaultHeaders` off a config typed by the OpenAI SDK but issue plain JSON
 * requests.
 */
export function toHeaderRecord(
  headers: BytePlusArkConfig['defaultHeaders'],
): Record<string, string> {
  const record: Record<string, string> = {}
  if (!headers) return record

  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      record[key] = value
    })
    return record
  }

  // The entry-list form is typed as arrays of nullable values rather than
  // strict [name, value] tuples, so both halves are checked.
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      if (typeof key === 'string' && typeof value === 'string') {
        record[key] = value
      }
    }
    return record
  }

  const headerEntries = Object.entries(headers)
  for (const [key, value] of headerEntries) {
    if (typeof value === 'string') record[key] = value
  }

  return record
}

/**
 * Drops any caller-supplied header whose name case-insensitively collides with
 * one the adapter sets itself, then applies the adapter's own.
 *
 * Spreading `reserved` last is not enough on its own: HTTP header names are
 * case-insensitive, but plain object keys are not, so `authorization` and
 * `Authorization` are two distinct properties that both survive the spread.
 * `fetch` then feeds the object to the `Headers` constructor, which *appends*
 * rather than replaces — turning the pair into
 * `authorization: "Bearer wrong, Bearer right"` and 401ing every request with
 * what reads like a bad key. `toHeaderRecord` lowercases names whenever
 * `defaultHeaders` arrives as a `Headers` instance, so that collision is
 * reachable through ordinary config, not just a hand-built record.
 */
function applyReservedHeaders(
  extraHeaders: Record<string, string> | undefined,
  reserved: Record<string, string>,
): Record<string, string> {
  const blocked = new Set(Object.keys(reserved).map((key) => key.toLowerCase()))
  const merged: Record<string, string> = {}
  const extraHeaderEntries = Object.entries(extraHeaders ?? {})
  for (const [key, value] of extraHeaderEntries) {
    if (!blocked.has(key.toLowerCase())) merged[key] = value
  }
  return { ...merged, ...reserved }
}

/**
 * Turns the OpenAI-shaped `timeout` config field (milliseconds) into the
 * `signal` a plain `fetch` needs, or `undefined` when no timeout is set.
 *
 * `BytePlusArkConfig` extends the OpenAI SDK's `ClientOptions` because the
 * chat adapter drives the SDK, which honours `timeout` and `maxRetries`
 * itself. The video, image and speech adapters issue plain JSON requests, so
 * without this they would accept a `timeout` and ignore it — a stalled Ark
 * connection hanging the caller forever despite an explicit setting.
 *
 * `maxRetries` has no equivalent here and stays SDK-path-only; it is
 * documented as such on {@link BytePlusArkConfig}.
 */
export function bytePlusTimeoutSignal(
  timeout: number | undefined,
): AbortSignal | undefined {
  return typeof timeout === 'number' && timeout > 0
    ? AbortSignal.timeout(timeout)
    : undefined
}

/**
 * Headers for a JSON request against the Ark data plane.
 *
 * A caller-supplied `Authorization` or `Content-Type` in `defaultHeaders` is
 * dropped in any casing — see {@link applyReservedHeaders}.
 */
export function bytePlusArkHeaders(
  apiKey: string,
  extraHeaders?: Record<string, string>,
): Record<string, string> {
  return applyReservedHeaders(extraHeaders, {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  })
}

/**
 * Headers for a JSON request against the Seed Speech host.
 *
 * As with {@link bytePlusArkHeaders}, a caller-supplied `X-Api-Key` is dropped
 * in any casing. Seed Speech answers a clobbered key with
 * `45000010 Invalid X-Api-Key`, which reads as a misconfigured key rather than
 * a header collision.
 */
export function bytePlusVoiceHeaders(
  apiKey: string,
  extraHeaders?: Record<string, string>,
): Record<string, string> {
  return applyReservedHeaders(extraHeaders, {
    'Content-Type': 'application/json',
    'X-Api-Key': apiKey,
  })
}

/**
 * Reads a response body as JSON, tolerating the non-JSON failures both
 * BytePlus hosts can return (an empty body, or an HTML error page from a proxy
 * in front of the API).
 *
 * Returns the parsed value, the raw text when it is not JSON, or `undefined`
 * for an empty body — all three of which {@link bytePlusArkError} and
 * {@link bytePlusVoiceError} know how to render.
 */
export async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

/**
 * Best-effort human-readable rendering of a response body we could not pull a
 * `message` out of — a raw string passes through, any other object is
 * serialized so the detail reaches the error instead of being dropped.
 *
 * Exported for adapters that need to attach a body to an error they raise
 * themselves rather than one derived from a non-OK response — e.g. the image
 * adapter reporting a 200 whose `data[]` items match no known shape.
 */
export function describeBody(body: unknown): string | undefined {
  if (typeof body === 'string') return body || undefined
  if (typeof body !== 'object') return undefined
  if (body === null) return undefined
  try {
    return JSON.stringify(body)
  } catch {
    // Circular or otherwise unserializable — the status code stands alone.
    return undefined
  }
}

function readStringField(value: unknown, field: string): string | undefined {
  if (typeof value !== 'object') return undefined
  if (value === null) return undefined
  if (!(field in value)) return undefined
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
  const detail = message ?? describeBody(body)
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
  const detail = message ?? describeBody(body)
  return new Error(
    `${prefix} failed (${status}${code ? ` ${code}` : ''})${
      detail ? `: ${detail}` : ''
    }`,
  )
}
