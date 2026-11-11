import { Ollama } from 'ollama'
import { generateId as _generateId } from '@tanstack/ai-utils'
import { sendWith } from '@tanstack/ai-utils/kubb'
import type { ClientInstance } from '@tanstack/ai-utils/kubb'
import type { ChatResponse } from 'ollama'

export interface OllamaClientConfig {
  /**
   * Base URL for every request. Same option name as the other adapters, so a
   * gateway config can be spread into any of them. Wins over `host` when both
   * are set.
   */
  baseURL?: string
  /** Alias of `baseURL`. */
  host?: string
  /**
   * Headers sent with every request. Same option name as the other adapters.
   * Wins over `headers` when both are set.
   */
  defaultHeaders?: Record<string, string>
  /** Alias of `defaultHeaders`. */
  headers?: Record<string, string> | undefined
}

/**
 * Creates an Ollama client instance. A `fetch` replaces the client's fetch.
 */
export function createOllamaClient(
  config: OllamaClientConfig = {},
  fetch?: typeof globalThis.fetch,
): Ollama {
  return new Ollama({
    host: config.baseURL || config.host || 'http://localhost:11434',
    headers: config.defaultHeaders ?? config.headers,
    ...(fetch && { fetch }),
  })
}

/** The `ollama` SDK's error for a non-2xx response. */
class ResponseError extends Error {
  override name = 'ResponseError'
  constructor(
    readonly error: string,
    readonly status_code: number,
  ) {
    super(error)
  }
}

/**
 * The SDK's host format: `127.0.0.1` and `:11434` become
 * `http://127.0.0.1:11434`, and the port is always written out.
 */
function formatHost(host: string) {
  let explicit = host.includes('://')
  if (host.startsWith(':')) {
    host = `http://127.0.0.1${host}`
    explicit = true
  }
  const url = new URL(explicit ? host : `http://${host}`)
  const port =
    url.port || (!explicit ? '11434' : url.protocol === 'https:' ? '443' : '80')
  const auth = url.username
    ? `${url.username}${url.password ? `:${url.password}` : ''}@`
    : ''
  return `${url.protocol}//${auth}${url.hostname}:${port}${url.pathname}`.replace(
    /\/$/,
    '',
  )
}

/**
 * A client for the generated Ollama operations. It sends the same requests as
 * the `ollama` SDK, without the SDK's `User-Agent`. A `fetch` replaces the
 * global `fetch`.
 *
 * @throws ResponseError for a non-2xx response, with the SDK's message: the
 * `error` of a JSON body, else the body text, else the status line.
 */
export function createOllamaFetchClient(
  config: OllamaClientConfig,
  fetch?: typeof globalThis.fetch,
): ClientInstance {
  const host = formatHost(
    config.baseURL || config.host || 'http://localhost:11434',
  )
  return sendWith(async (request) => {
    const url = `${host}${request.path}`
    const headers = new Headers(config.defaultHeaders ?? config.headers)
    headers.set('Content-Type', 'application/json')
    headers.set('Accept', 'application/json')
    // The SDK sends `OLLAMA_API_KEY` to Ollama's cloud API.
    const apiKey =
      typeof process === 'undefined' ? undefined : process.env['OLLAMA_API_KEY']
    const { protocol, hostname } = new URL(url)
    if (
      apiKey &&
      protocol === 'https:' &&
      hostname === 'ollama.com' &&
      !headers.has('Authorization')
    ) {
      headers.set('Authorization', `Bearer ${apiKey}`)
    }
    const response = await (fetch ?? globalThis.fetch)(url, {
      method: request.method,
      headers,
      body: request.body,
      signal: request.signal,
    })
    if (response.ok) return response
    let message = `Error ${response.status}: ${response.statusText}`
    try {
      message = response.headers
        .get('content-type')
        ?.includes('application/json')
        ? (await response.json()).error || message
        : (await response.text()) || message
    } catch {
      // Keep the status line.
    }
    throw new ResponseError(message, response.status)
  })
}

/**
 * The chunks of an Ollama NDJSON stream (one JSON object per line), checked
 * like the SDK's stream: an `error` chunk throws, the `done` chunk ends it, and
 * a stream that ends before `done` throws. A malformed line is skipped with a
 * warning. Stopping early cancels the body.
 */
export async function* readChatStream(
  response: Response,
): AsyncGenerator<ChatResponse> {
  if (!response.body) throw new Error('Missing body')
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  try {
    for (;;) {
      const { done, value = '' } = await reader.read()
      const lines = (buffer + value).split('\n')
      buffer = done ? '' : (lines.pop() ?? '')
      for (const line of lines) {
        if (!line.trim()) continue
        let chunk: ChatResponse | { error: string }
        try {
          chunk = JSON.parse(line)
        } catch {
          console.warn('invalid json: ', line)
          continue
        }
        if ('error' in chunk) throw new Error(chunk.error)
        yield chunk
        if (chunk.done) return
      }
      if (done) break
    }
  } finally {
    reader.cancel().catch(() => {})
  }
  throw new Error('Did not receive done or success response in stream.')
}

/**
 * Gets Ollama host from environment variables
 * Falls back to default localhost
 */
export function getOllamaHostFromEnv(): string {
  const env =
    typeof globalThis !== 'undefined' &&
    (globalThis as Record<string, unknown>).window
      ? ((
          (globalThis as Record<string, unknown>).window as Record<
            string,
            unknown
          >
        ).env as Record<string, string> | undefined)
      : typeof process !== 'undefined'
        ? process.env
        : undefined
  return env?.['OLLAMA_HOST'] || 'http://localhost:11434'
}

/**
 * Generates a unique ID with a prefix
 */
export function generateId(prefix: string = 'msg'): string {
  return _generateId(prefix)
}

/**
 * Estimates token count for text (rough approximation)
 */
export function estimateTokens(text: string): number {
  // Rough approximation: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4)
}
