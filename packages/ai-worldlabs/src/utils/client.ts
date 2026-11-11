import { getApiKeyFromEnv } from '@tanstack/ai-utils'
import { sendWith } from '@tanstack/ai-utils/kubb'
import type { ClientInstance } from '@tanstack/ai-utils/kubb'

export const DEFAULT_WORLDLABS_API_URL = 'https://api.worldlabs.ai'

export interface WorldLabsClientConfig {
  apiKey?: string
  baseUrl?: string
  fetch?: typeof fetch
  defaultHeaders?: Record<string, string>
}

export function getWorldLabsApiKeyFromEnv(): string {
  return getApiKeyFromEnv('WORLDLABS_API_KEY')
}

export function resolveWorldLabsApiKey(config?: WorldLabsClientConfig): string {
  return config?.apiKey ?? getWorldLabsApiKeyFromEnv()
}

export function resolveWorldLabsApiUrl(config?: WorldLabsClientConfig): string {
  return (config?.baseUrl ?? DEFAULT_WORLDLABS_API_URL).replace(/\/+$/, '')
}

/**
 * Returns a factory of clients for the generated operations. Each client sends
 * through the configured `fetch` with the `WLT-Api-Key` header, and throws an
 * `Error` that starts with `prefix` for a network error or a non-2xx status.
 */
export function createWorldLabsClient(
  config: WorldLabsClientConfig = {},
): (prefix: string) => ClientInstance {
  const apiKey = resolveWorldLabsApiKey(config)
  const baseUrl = resolveWorldLabsApiUrl(config)
  const fetchImpl = config.fetch ?? globalThis.fetch
  if (typeof fetchImpl !== 'function') {
    throw new Error(
      'global fetch is not available. Pass `fetch` in the World Labs adapter config.',
    )
  }

  return (prefix) =>
    sendWith(async (request) => {
      const headers = new Headers(config.defaultHeaders)
      for (const [name, value] of Object.entries(request.headers)) {
        headers.set(name, value)
      }
      // No body, no content type (a GET poll).
      if (request.body === undefined) headers.delete('Content-Type')
      headers.set('WLT-Api-Key', apiKey)

      let response: Response
      try {
        response = await fetchImpl(`${baseUrl}${request.path}`, {
          method: request.method,
          headers,
          body: request.body,
          signal: request.signal,
        })
      } catch (error) {
        throw worldLabsRequestError(prefix, undefined, error)
      }
      if (!response.ok) {
        // The hey-api client's error: the JSON body, else the text, else `{}`.
        const text = await response.text()
        let json: unknown
        try {
          json = JSON.parse(text)
        } catch {
          // Not JSON: keep the text.
        }
        throw worldLabsRequestError(prefix, response, (json ?? text) || {})
      }
      return response
    })
}

function worldLabsRequestError(
  prefix: string,
  response: Response | undefined,
  error: unknown,
): Error {
  const status = response
    ? `${response.status}${response.statusText ? ` ${response.statusText}` : ''}`
    : undefined
  const detail = errorDetail(error)
  return new Error(
    `${prefix}${status ? ` (${status})` : ''}${detail ? `: ${detail}` : ''}`,
  )
}

function errorDetail(error: unknown): string | undefined {
  if (typeof error === 'string' && error.length > 0) return error
  if (typeof error === 'object' && error !== null) {
    const record = error as { detail?: unknown; message?: unknown }
    if (typeof record.detail === 'string' && record.detail.length > 0) {
      return record.detail
    }
    if (typeof record.message === 'string' && record.message.length > 0) {
      return record.message
    }
    try {
      return JSON.stringify(error)
    } catch {
      return undefined
    }
  }
  return undefined
}
