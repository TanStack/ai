import type { StreamChunk } from './types'

/**
 * Collect all text content from a StreamChunk async iterable and return as a string.
 *
 * This function consumes the entire stream, accumulating content from TEXT_MESSAGE_CONTENT events,
 * and returns the final concatenated text.
 *
 * @param stream - AsyncIterable of StreamChunks from chat()
 * @returns Promise<string> - The accumulated text content
 *
 * @example
 * ```typescript
 * const stream = chat({
 *   adapter: openaiText(),
 *   model: 'gpt-4o',
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 * const text = await streamToText(stream);
 * console.log(text); // "Hello! How can I help you today?"
 * ```
 */
export async function streamToText(
  stream: AsyncIterable<StreamChunk>,
): Promise<string> {
  let accumulatedContent = ''

  for await (const chunk of stream) {
    if (chunk.type === 'TEXT_MESSAGE_CONTENT' && chunk.delta) {
      accumulatedContent += chunk.delta
    }
  }

  return accumulatedContent
}

/**
 * Convert a StreamChunk async iterable to a ReadableStream in Server-Sent Events format
 *
 * This creates a ReadableStream that emits chunks in SSE format:
 * - Each chunk is prefixed with "data: "
 * - Each chunk is followed by "\n\n"
 * - Stream ends with "data: [DONE]\n\n"
 *
 * @param stream - AsyncIterable of StreamChunks from chat()
 * @param abortController - Optional AbortController to abort when stream is cancelled
 * @returns ReadableStream in Server-Sent Events format
 */
export function toServerSentEventsStream(
  stream: AsyncIterable<StreamChunk>,
  abortController?: AbortController,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          // Check if stream was cancelled/aborted
          if (abortController?.signal.aborted) {
            break
          }

          // Send each chunk as Server-Sent Events format
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`),
          )
        }

        // Send completion marker
        controller.enqueue(encoder.encode('data: [DONE]\n\n'))
        controller.close()
      } catch (error: any) {
        // Don't send error if aborted
        if (abortController?.signal.aborted) {
          controller.close()
          return
        }

        // Send error event (AG-UI RUN_ERROR)
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'RUN_ERROR',
              timestamp: Date.now(),
              error: {
                message: error.message || 'Unknown error occurred',
                code: error.code,
              },
            })}\n\n`,
          ),
        )
        controller.close()
      }
    },
    cancel() {
      // When the ReadableStream is cancelled (e.g., client disconnects),
      // abort the underlying stream
      if (abortController) {
        abortController.abort()
      }
    },
  })
}

/**
 * Convert a StreamChunk async iterable to a Response in Server-Sent Events format
 *
 * This creates a Response that emits chunks in SSE format:
 * - Each chunk is prefixed with "data: "
 * - Each chunk is followed by "\n\n"
 * - Stream ends with "data: [DONE]\n\n"
 *
 * @param stream - AsyncIterable of StreamChunks from chat()
 * @param init - Optional Response initialization options (including `abortController`)
 * @returns Response in Server-Sent Events format
 *
 * @example
 * ```typescript
 * const stream = chat({ adapter: openaiText(), model: "gpt-4o", messages: [...] });
 * return toServerSentEventsResponse(stream, { abortController });
 * ```
 */
export function toServerSentEventsResponse(
  stream: AsyncIterable<StreamChunk>,
  init?: ResponseInit & { abortController?: AbortController },
): Response {
  const { headers, abortController, ...responseInit } = init ?? {}

  // Start with default SSE headers
  const mergedHeaders = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  })

  // Override with user headers if provided, handling all HeadersInit forms:
  // Headers instance, string[][], or plain object
  if (headers) {
    const userHeaders = new Headers(headers)
    userHeaders.forEach((value, key) => {
      mergedHeaders.set(key, value)
    })
  }

  return new Response(toServerSentEventsStream(stream, abortController), {
    ...responseInit,
    headers: mergedHeaders,
  })
}

/**
 * Convert a StreamChunk async iterable to a ReadableStream in HTTP stream format (newline-delimited JSON)
 *
 * This creates a ReadableStream that emits chunks as newline-delimited JSON:
 * - Each chunk is JSON.stringify'd and followed by "\n"
 * - No SSE formatting (no "data: " prefix)
 *
 * This format is compatible with `fetchHttpStream` connection adapter.
 *
 * @param stream - AsyncIterable of StreamChunks from chat()
 * @param abortController - Optional AbortController to abort when stream is cancelled
 * @returns ReadableStream in HTTP stream format (newline-delimited JSON)
 *
 * @example
 * ```typescript
 * const stream = chat({ adapter: openaiText(), model: "gpt-4o", messages: [...] });
 * const readableStream = toHttpStream(stream);
 * // Use with Response for HTTP streaming (not SSE)
 * return new Response(readableStream, {
 *   headers: { 'Content-Type': 'application/x-ndjson' }
 * });
 * ```
 */
export function toHttpStream(
  stream: AsyncIterable<StreamChunk>,
  abortController?: AbortController,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()

  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of stream) {
          // Check if stream was cancelled/aborted
          if (abortController?.signal.aborted) {
            break
          }

          // Send each chunk as newline-delimited JSON
          controller.enqueue(encoder.encode(`${JSON.stringify(chunk)}\n`))
        }

        controller.close()
      } catch (error: any) {
        // Don't send error if aborted
        if (abortController?.signal.aborted) {
          controller.close()
          return
        }

        // Send error event (AG-UI RUN_ERROR)
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({
              type: 'RUN_ERROR',
              timestamp: Date.now(),
              error: {
                message: error.message || 'Unknown error occurred',
                code: error.code,
              },
            })}\n`,
          ),
        )
        controller.close()
      }
    },
    cancel() {
      // When the ReadableStream is cancelled (e.g., client disconnects),
      // abort the underlying stream
      if (abortController) {
        abortController.abort()
      }
    },
  })
}

/**
 * Convert a StreamChunk async iterable to a Response in HTTP stream format (newline-delimited JSON)
 *
 * This creates a Response that emits chunks in HTTP stream format:
 * - Each chunk is JSON.stringify'd and followed by "\n"
 * - No SSE formatting (no "data: " prefix)
 *
 * This format is compatible with `fetchHttpStream` connection adapter.
 *
 * @param stream - AsyncIterable of StreamChunks from chat()
 * @param init - Optional Response initialization options (including `abortController`)
 * @returns Response in HTTP stream format (newline-delimited JSON)
 *
 * @example
 * ```typescript
 * const stream = chat({ adapter: openaiText(), model: "gpt-4o", messages: [...] });
 * return toHttpResponse(stream, { abortController });
 * ```
 */
export function toHttpResponse(
  stream: AsyncIterable<StreamChunk>,
  init?: ResponseInit & { abortController?: AbortController },
): Response {
  return new Response(toHttpStream(stream, init?.abortController), {
    ...init,
  })
}
