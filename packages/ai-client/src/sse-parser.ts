import { ByokMissingError, isByokMissingBody } from '@tanstack/ai/byok'
import {
  createResponseStreamTextDecoder,
  getResponseStreamReader,
} from './response-stream'
import { parseSseDataLine } from './sse-utils'
import type { StreamChunk } from '@tanstack/ai/client'

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

export async function* parseSSEResponse(
  response: Response,
  abortSignal?: AbortSignal,
): AsyncGenerator<StreamChunk> {
  if (!response.ok) {
    if (response.status === 401) {
      const body: unknown = await response
        .clone()
        .json()
        .catch(() => null)
      if (isByokMissingBody(body)) {
        throw new ByokMissingError(body.error.provider)
      }
    }
    throw new Error(
      `HTTP error! status: ${response.status} ${response.statusText}`,
    )
  }

  const reader = getResponseStreamReader(response)

  const streamLines = readStreamLines(reader, abortSignal)
  for await (const line of streamLines) {
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
