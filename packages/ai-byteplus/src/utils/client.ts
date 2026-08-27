import { getApiKeyFromEnv } from '@tanstack/ai-utils'
import type { ClientOptions } from 'openai'

export const BYTEPLUS_ARK_BASE_URL =
  'https://ark.ap-southeast.bytepluses.com/api/v3'

export const BYTEPLUS_VOICE_BASE_URL =
  'https://voice.ap-southeast-1.bytepluses.com'

export interface BytePlusArkConfig extends Omit<ClientOptions, 'apiKey'> {
  apiKey: string
}

export interface BytePlusVoiceConfig {
  /** Seed Speech API key — *not* the Ark key. Sent as `X-Api-Key`. */
  apiKey: string

  /** Overrides {@link BYTEPLUS_VOICE_BASE_URL}. */
  baseURL?: string

  /** Additional headers merged into every request (e.g., test ids). */
  defaultHeaders?: Record<string, string>

  fetch?: typeof fetch
}

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

export function getBytePlusVoiceApiKeyFromEnv(): string {
  try {
    return getApiKeyFromEnv('BYTEPLUS_VOICE_API_KEY')
  } catch {
    throw new Error(
      'BYTEPLUS_VOICE_API_KEY is required for Seed Speech (TTS/ASR). This is a different key from ARK_API_KEY. Please set it in your environment variables or use the factory function with an explicit API key.',
    )
  }
}

export function withBytePlusArkDefaults<TConfig extends BytePlusArkConfig>(
  config: TConfig,
): Omit<TConfig, 'baseURL'> & { baseURL: string } {
  return {
    ...config,
    baseURL: (config.baseURL || BYTEPLUS_ARK_BASE_URL).replace(/\/+$/, ''),
  }
}

export function withBytePlusVoiceDefaults<TConfig extends BytePlusVoiceConfig>(
  config: TConfig,
): Omit<TConfig, 'baseURL'> & { baseURL: string } {
  return {
    ...config,
    baseURL: (config.baseURL || BYTEPLUS_VOICE_BASE_URL).replace(/\/+$/, ''),
  }
}

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

export function bytePlusTimeoutSignal(
  timeout: number | undefined,
): AbortSignal | undefined {
  return typeof timeout === 'number' && timeout > 0
    ? AbortSignal.timeout(timeout)
    : undefined
}

export function bytePlusArkHeaders(
  apiKey: string,
  extraHeaders?: Record<string, string>,
): Record<string, string> {
  return applyReservedHeaders(extraHeaders, {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  })
}

export function bytePlusVoiceHeaders(
  apiKey: string,
  extraHeaders?: Record<string, string>,
): Record<string, string> {
  return applyReservedHeaders(extraHeaders, {
    'Content-Type': 'application/json',
    'X-Api-Key': apiKey,
  })
}

export async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

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
