import {
  createResponseStreamTextDecoder,
  getResponseStreamReader,
} from './response-stream'
import { parseSseDataLine } from './sse-utils'
import type { StreamChunk } from '@tanstack/ai/client'

/**
 * Read lines from a stream (newline-delimited)
 */
async function* readStreamLines(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  abortSignal?: AbortSignal,
): AsyncGenerator<string> {
  try {
    const decoder = createResponseStreamTextDecoder()
    let buffer = ''

    while (!abortSignal?.aborted) {
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

  const reader = getResponseStreamReader(response)

  for await (const line of readStreamLines(reader, abortSignal)) {
    const data = parseSseDataLine(line)

    if (data === '[DONE]') {
      console.warn(
        '[@tanstack/ai-client] Received [DONE] sentinel. This is deprecated — upgrade your @tanstack/ai server package. RUN_FINISHED is the stream terminator.',
      )
      continue
    }

    try {
      const parsed: StreamChunk = JSON.parse(data)
      yield parsed
    } catch (parseError) {
      console.warn('Failed to parse SSE chunk:', data)
    }
  }
}
