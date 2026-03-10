import type { StreamChunk } from '@tanstack/ai'

/**
 * Read lines from a stream (newline-delimited)
 */
async function* readStreamLines(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  abortSignal?: AbortSignal,
): AsyncGenerator<string> {
  try {
    const decoder = new TextDecoder()
    let buffer = ''

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (true) {
      if (abortSignal?.aborted) {
        break
      }

      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')

      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line.trim()) {
          yield line
        }
      }
    }

    if (buffer.trim()) {
      yield buffer
    }
  } finally {
    reader.releaseLock()
  }
}

/**
 * Parse a Response body as Server-Sent Events, yielding StreamChunks.
 *
 * Used by GenerationClient to parse SSE Responses returned from fetchers
 * (e.g., TanStack Start server functions using `toServerSentEventsResponse()`).
 */
export async function* parseSSEResponse(
  response: Response,
  abortSignal?: AbortSignal,
): AsyncGenerator<StreamChunk> {
  if (!response.ok) {
    throw new Error(
      `HTTP error! status: ${response.status} ${response.statusText}`,
    )
  }

  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Response body is not readable')
  }

  for await (const line of readStreamLines(reader, abortSignal)) {
    const data = line.startsWith('data: ') ? line.slice(6) : line

    if (data === '[DONE]') continue

    try {
      const parsed: StreamChunk = JSON.parse(data)
      yield parsed
    } catch (parseError) {
      console.warn('Failed to parse SSE chunk:', data)
    }
  }
}
