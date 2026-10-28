import type { Ai } from '@cloudflare/workers-types'
import type {
  CloudflareBindingConfig,
  CloudflareGatewayOptions,
  FetchLike,
} from './config'

/**
 * Workers AI streams end with a usage-only trailer (`{"response":"","usage":
 * {...}}`) that has no `choices` field. The OpenAI Chat Completions stream
 * reader indexes `chunk.choices[0]` on every event, so give such events an
 * empty `choices` array (OpenAI's own usage-only trailer shape) and keep the
 * usage totals they carry. SSE allows `data:` without the space, and CR, LF
 * or CRLF line ends.
 */
export function normalizeSseResponse(response: Response): Response {
  const contentType = response.headers.get('content-type') ?? ''
  if (
    !response.body ||
    !contentType.toLowerCase().includes('text/event-stream')
  ) {
    return response
  }
  let buffer = ''
  const fixLine = (line: string): string => {
    if (!line.startsWith('data:')) return line
    const data = line.slice(line.startsWith('data: ') ? 6 : 5)
    if (data === '[DONE]') return line
    try {
      const event = JSON.parse(data) as Record<string, unknown>
      if (event && typeof event === 'object' && !('choices' in event)) {
        return `data: ${JSON.stringify({ ...event, choices: [] })}`
      }
    } catch {
      // Not JSON: forward untouched.
    }
    return line
  }
  const body = response.body
    .pipeThrough(new TextDecoderStream())
    .pipeThrough(
      new TransformStream<string, string>({
        transform(chunk, controller) {
          buffer += chunk
          // ponytail: a CRLF split across two chunks adds one blank line.
          // That only ends the current event at its last line.
          const lines = buffer.split(/\r\n|\r|\n/)
          buffer = lines.pop() ?? ''
          for (const line of lines) controller.enqueue(`${fixLine(line)}\n`)
        },
        flush(controller) {
          if (buffer) controller.enqueue(fixLine(buffer))
        },
      }),
    )
    .pipeThrough(new TextEncoderStream())
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

/**
 * Cloudflare error bodies look like `{ name, message, internalCode }` or
 * `{ errors: [{ code, message }] }`. The OpenAI SDK only reads
 * `body.error.message`, so rewrap them or every failure reads as
 * "status code (no body)".
 */
export async function normalizeErrorResponse(
  response: Response,
): Promise<Response> {
  const text = await response.text()
  let body = text
  try {
    const json = JSON.parse(text) as {
      error?: unknown
      errors?: Array<{ code?: number; message?: string }>
      message?: string
      name?: string
      internalCode?: number
    }
    if (json && typeof json === 'object' && !('error' in json)) {
      const first = json.errors?.[0]
      body = JSON.stringify({
        error: {
          message: json.message ?? first?.message ?? text,
          type: json.name ?? 'cloudflare_error',
          code: json.internalCode ?? first?.code ?? null,
        },
      })
    }
  } catch {
    // Not JSON: forward the text as-is.
  }
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

/** Applies the error and SSE normalizations a raw Cloudflare response needs. */
export async function normalizeResponse(response: Response): Promise<Response> {
  return response.ok
    ? normalizeSseResponse(response)
    : await normalizeErrorResponse(response)
}

/**
 * Makes `env.AI` look like an OpenAI-compatible HTTP endpoint to the OpenAI
 * SDK: the JSON request body becomes `binding.run(model, inputs)` and the
 * raw inference `Response` (OpenAI-format JSON or SSE) is handed back.
 *
 * The SDK's own request headers (auth, user agent, `x-stainless-*`) are
 * dropped; only the configured `defaultHeaders` reach Workers AI.
 */
export function createBindingFetch({
  binding,
  gateway,
  defaultHeaders,
}: CloudflareBindingConfig): FetchLike {
  // `Ai` is typed against the bundled model catalog; the adapter accepts any
  // model id, so widen the binding to the open catalog shape for this call.
  const run = binding.run.bind(binding) as (
    model: string,
    inputs: Record<string, unknown>,
    options: Record<string, unknown>,
  ) => Promise<unknown>
  return async (_input, init) => {
    const { model, ...inputs } = JSON.parse(
      typeof init?.body === 'string' ? init.body : '{}',
    ) as { model: string } & Record<string, unknown>
    const response = (await run(model, inputs, {
      returnRawResponse: true,
      ...(gateway && { gateway }),
      ...(defaultHeaders && { extraHeaders: defaultHeaders }),
    })) as Response
    return await normalizeResponse(response)
  }
}

/** Options of {@link cloudflareBindingFetch}. */
export interface CloudflareBindingFetchOptions {
  /** The Workers AI binding, `env.AI`. */
  binding: Ai
  /**
   * The AI Gateway vendor of the model. `'anthropic'` carries Anthropic
   * Messages requests (`createAnthropicChat`), and `'openai'` carries OpenAI
   * Responses requests (`createOpenaiChat`).
   */
  vendor: 'anthropic' | 'openai'
  /** AI Gateway options, passed to `env.AI.run`. */
  gateway?: CloudflareGatewayOptions
}

// The SDK's transport and auth headers. The binding authenticates by itself.
const SDK_HEADERS = new Set([
  'x-api-key',
  'authorization',
  'anthropic-version',
  'user-agent',
  'content-type',
  'accept',
  'content-length',
  'idempotency-key',
  'openai-organization',
  'openai-project',
  'anthropic-dangerous-direct-browser-access',
])

function forwardedHeaders(headers: HeadersInit | undefined) {
  const forwarded: Record<string, string> = {}
  for (const [name, value] of new Headers(headers)) {
    if (!SDK_HEADERS.has(name) && !name.startsWith('x-stainless-')) {
      forwarded[name] = value
    }
  }
  return forwarded
}

/**
 * A `fetch` that sends the requests of the Anthropic or OpenAI SDK through the
 * Workers AI binding, to the AI Gateway `anthropic/...` or `openai/...` models.
 * Pass it as `fetch` to `createAnthropicChat` or `createOpenaiChat`. The
 * binding authenticates, so the key argument can be any placeholder.
 *
 * The request body goes to `env.AI.run('<vendor>/<model>', body)`. Headers
 * such as `anthropic-beta` go along as `extraHeaders`.
 *
 * @example
 * ```ts
 * const adapter = createAnthropicChat('claude-opus-5-5', 'cloudflare-binding', {
 *   fetch: cloudflareBindingFetch({ binding: env.AI, vendor: 'anthropic' }),
 * })
 * ```
 */
export function cloudflareBindingFetch(
  options: CloudflareBindingFetchOptions,
): FetchLike {
  const { binding, vendor, gateway } = options
  // `Ai` is typed against the bundled catalog; gateway ids are outside it.
  // With `returnRawResponse`, the binding returns the raw `Response`.
  const run = binding.run.bind(binding) as (
    model: string,
    inputs: Record<string, unknown>,
    options: Record<string, unknown>,
  ) => Promise<Response>
  const prefix = `${vendor}/`
  return async (_input, init) => {
    if (typeof init?.body !== 'string') {
      throw new Error('cloudflareBindingFetch needs a JSON string body.')
    }
    const { model, ...body }: { model?: string } & Record<string, unknown> =
      JSON.parse(init.body)
    const id = model ?? ''
    const extraHeaders = forwardedHeaders(init.headers)
    const pending = run(id.startsWith(prefix) ? id : prefix + id, body, {
      returnRawResponse: true,
      ...(gateway && { gateway }),
      ...(Object.keys(extraHeaders).length > 0 && { extraHeaders }),
    })
    // `env.AI.run` takes no signal, so an abort rejects the wait instead.
    const { signal } = init
    signal?.throwIfAborted()
    const response = await (signal
      ? Promise.race([
          pending,
          new Promise<never>((_, reject) =>
            signal.addEventListener('abort', () => reject(signal.reason), {
              once: true,
            }),
          ),
        ])
      : pending)
    return response.ok ? response : await normalizeErrorResponse(response)
  }
}

/** Wraps a REST fetch so responses get the same error and trailer fixes. */
export function createRestFetch(baseFetch: FetchLike | undefined): FetchLike {
  const fetchImpl = baseFetch ?? fetch
  return async (input, init) =>
    await normalizeResponse(await fetchImpl(input, init))
}
