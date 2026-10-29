import type { ClientOptions } from 'openai'

type Fetch = NonNullable<ClientOptions['fetch']>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The text of a `reasoning` part: its `text`, `summary[].text` and `content[].text`. */
function reasoningText(part: Record<string, unknown>): string {
  let text = typeof part.text === 'string' ? part.text : ''
  for (const key of ['summary', 'content']) {
    const entries = part[key]
    if (!Array.isArray(entries)) continue
    for (const entry of entries) {
      if (isRecord(entry) && typeof entry.text === 'string') text += entry.text
    }
  }
  return text
}

/**
 * Turn an array `content` on a message or delta into the string the Chat
 * Completions spec requires. `text` parts become `content`; `reasoning` parts
 * go to `reasoning_content`, where the adapter reads reasoning.
 */
function flattenContent(target: unknown): boolean {
  if (!isRecord(target) || !Array.isArray(target.content)) return false
  let text = ''
  let reasoning = ''
  for (const part of target.content) {
    if (!isRecord(part)) continue
    if (part.type === 'text' && typeof part.text === 'string') text += part.text
    else if (part.type === 'reasoning') reasoning += reasoningText(part)
  }
  target.content = text
  if (reasoning) {
    const existing =
      typeof target.reasoning_content === 'string'
        ? target.reasoning_content
        : ''
    target.reasoning_content = existing + reasoning
  }
  return true
}

/** Repair Neon content and usage fields, or return `undefined` when unchanged. */
function rewrite(json: string): string | undefined {
  let body: unknown
  try {
    body = JSON.parse(json)
  } catch {
    return undefined
  }
  if (!isRecord(body) || !Array.isArray(body.choices)) return undefined
  let changed = false
  for (const choice of body.choices) {
    if (!isRecord(choice)) continue
    if (flattenContent(choice.message)) changed = true
    if (flattenContent(choice.delta)) changed = true
  }
  // Gemini reports reasoning tokens at the root of usage. The inherited
  // Chat Completions parser reads the standard nested field, including on
  // usage-only chunks whose choices array is empty.
  if (isRecord(body.usage) && typeof body.usage.reasoning_tokens === 'number') {
    const details = isRecord(body.usage.completion_tokens_details)
      ? body.usage.completion_tokens_details
      : {}
    body.usage.completion_tokens_details = {
      ...details,
      reasoning_tokens: details.reasoning_tokens ?? body.usage.reasoning_tokens,
    }
    changed = true
  }
  return changed ? JSON.stringify(body) : undefined
}

/** Rewrites each SSE `data:` line, buffering a line split across chunks. */
function sseRewriter(): TransformStream<string, string> {
  let buffer = ''
  const rewriteLine = (line: string) => {
    if (!line.startsWith('data:')) return line
    const fixed = rewrite(line.slice(5))
    return fixed === undefined ? line : `data: ${fixed}`
  }
  return new TransformStream({
    transform(chunk, controller) {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      if (lines.length > 0) {
        controller.enqueue(lines.map(rewriteLine).join('\n') + '\n')
      }
    },
    flush(controller) {
      if (buffer) controller.enqueue(rewriteLine(buffer))
    },
  })
}

function withBody(response: Response, body: BodyInit): Response {
  const headers = new Headers(response.headers)
  // The body is already decoded, and a rewrite changes its length.
  headers.delete('content-length')
  headers.delete('content-encoding')
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

/**
 * A fetch for the Chat Completions route. For some models the gateway sends
 * `content` as an array of `{ type: 'reasoning' | 'text' }` parts instead of a
 * string, in JSON and in each streamed delta. This fetch rewrites those to the
 * spec shape before the OpenAI SDK reads them, so `chatStream`,
 * `structuredOutput` and `structuredOutputStream` all see strings. A body
 * with string content passes through unchanged.
 *
 * ponytail: remove when Neon returns string content (neondatabase/neon-pkgs#308).
 */
export function normalizeNeonContent(baseFetch?: Fetch): Fetch {
  return async (input, init) => {
    const response = await (baseFetch ?? globalThis.fetch)(input, init)
    if (!response.ok || !response.body) return response
    const type = response.headers.get('content-type') ?? ''
    if (type.includes('text/event-stream')) {
      return withBody(
        response,
        response.body
          .pipeThrough(new TextDecoderStream())
          .pipeThrough(sseRewriter())
          .pipeThrough(new TextEncoderStream()),
      )
    }
    if (type.includes('application/json')) {
      const text = await response.text()
      return withBody(response, rewrite(text) ?? text)
    }
    return response
  }
}
