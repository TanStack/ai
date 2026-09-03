import type { Ai } from '@cloudflare/workers-types'
import type { ClientOptions } from 'openai'
import type { CloudflareGatewayOptions } from './config'

export type FetchLike = NonNullable<ClientOptions['fetch']>

/**
 * Workers AI streams end with a usage-only trailer (`{"response":"","usage":
 * {...}}`) that has no `choices` field. The OpenAI Chat Completions stream
 * reader indexes `chunk.choices[0]` on every event, so give such events an
 * empty `choices` array (OpenAI's own usage-only trailer shape) and keep the
 * usage totals they carry.
 */
export function normalizeSseResponse(response: Response): Response {
  const contentType = response.headers.get('content-type') ?? ''
  if (!response.body || !contentType.includes('text/event-stream')) {
    return response
  }
  let buffer = ''
  const fixLine = (line: string): string => {
    if (!line.startsWith('data: ') || line === 'data: [DONE]') return line
    try {
      const event = JSON.parse(line.slice(6)) as Record<string, unknown>
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
          const lines = buffer.split('\n')
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
 */
export function createBindingFetch(
  binding: Ai,
  gateway?: CloudflareGatewayOptions,
): FetchLike {
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
    })) as Response
    return await normalizeResponse(response)
  }
}

/** Wraps a REST fetch so responses get the same error and trailer fixes. */
export function createRestFetch(baseFetch: FetchLike | undefined): FetchLike {
  const fetchImpl = baseFetch ?? fetch
  return async (input, init) =>
    await normalizeResponse(await fetchImpl(input, init))
}
