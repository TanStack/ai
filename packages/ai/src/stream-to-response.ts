import { toRunErrorPayload } from './activities/error-payload'
import { encodeOffset } from './stream-durability'
import type { StreamDurability } from './stream-durability'
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
 * - Stream ends when the underlying iterable is exhausted (RUN_FINISHED is the terminal event)
 *
 * @param stream - AsyncIterable of StreamChunks from chat()
 * @param abortController - Optional AbortController to abort when stream is cancelled
 * @returns ReadableStream in Server-Sent Events format
 */
export function toServerSentEventsStream(
  stream: AsyncIterable<StreamChunk>,
  abortController?: AbortController,
  getId?: (chunk: StreamChunk, index: number) => string | undefined,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()

  return new ReadableStream({
    async start(controller) {
      try {
        let index = 0
        for await (const chunk of stream) {
          // Check if stream was cancelled/aborted
          if (abortController?.signal.aborted) {
            break
          }

          // Tag the event with an `id:` line when a resolver is supplied
          // (delivery durability offsets). Native `EventSource` echoes the
          // last `id:` back as `Last-Event-ID` on reconnect, which is how
          // resume works with zero client-side cursor state.
          const id = getId?.(chunk, index)
          index += 1
          const idLine = id !== undefined ? `id: ${id}\n` : ''

          // Send each chunk as Server-Sent Events format
          controller.enqueue(
            encoder.encode(`${idLine}data: ${JSON.stringify(chunk)}\n\n`),
          )
        }

        controller.close()
      } catch (error: unknown) {
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
              error: toRunErrorPayload(error),
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

/** Default number of chunks buffered before a durability `append`. */
const DEFAULT_DURABILITY_BATCH = 32

/**
 * Resolve and validate the durability batch size. A non-positive-integer (0,
 * negative, fractional, or `NaN`) is rejected rather than clamped: silently
 * `Math.max(1, …)`-ing a `NaN` used to disable size-based flushing entirely
 * (`length >= NaN` is always false), which is a subtle footgun.
 */
function resolveBatchSize(batch: number | undefined): number {
  if (batch === undefined) return DEFAULT_DURABILITY_BATCH
  if (!Number.isInteger(batch) || batch <= 0) {
    throw new Error(
      `Invalid durability batch size: ${batch}. Must be a positive integer.`,
    )
  }
  return batch
}

/**
 * Boundaries at which the batching producer flushes early, regardless of the
 * batch size — terminal events and tool-call ends. Flushing here keeps the
 * durability log promptly consistent at semantically meaningful points.
 */
function isDurabilityFlushBoundary(chunk: StreamChunk): boolean {
  return (
    chunk.type === 'RUN_FINISHED' ||
    chunk.type === 'RUN_ERROR' ||
    chunk.type === 'TOOL_CALL_END'
  )
}

/**
 * Build the delivery-durable source iterable for a transport helper.
 *
 * - **Resume** (`resumeFrom()` non-null): replay strictly after the offset,
 *   reading only from the durability log. The input `stream` is NEVER iterated,
 *   so `chat()`'s lazy iterator never fires the provider — the untouched
 *   generator is simply GC'd. This is what makes resume free of re-invocation.
 * - **Fresh** (`resumeFrom()` null): iterate `stream`, buffering up to `batch`
 *   chunks (flushing early at terminal / tool-call boundaries), `append` each
 *   batch to the log, then forward. Appending BEFORE forwarding guarantees a
 *   reconnecting client can always replay exactly what it already saw.
 *
 * The returned `getId` maps each forwarded chunk to its `runId@seq` offset, for
 * the SSE `id:` line (ignored by the ndjson HTTP helper).
 */
function durableStreamSource(
  stream: AsyncIterable<StreamChunk>,
  durability: StreamDurability,
  options: { abortController?: AbortController; batch?: number },
): {
  source: AsyncIterable<StreamChunk>
  getId: (chunk: StreamChunk) => string | undefined
} {
  const runId = durability.runId()
  const resumeOffset = durability.resumeFrom()
  const batchSize = resolveBatchSize(options.batch)
  const abortController = options.abortController
  const idByChunk = new WeakMap<object, string>()
  const getId = (chunk: StreamChunk): string | undefined =>
    idByChunk.get(chunk)

  async function* produce(): AsyncIterable<StreamChunk> {
    let seq = 1
    let batch: Array<StreamChunk> = []
    let batchStart = 1

    async function* flush(): AsyncIterable<StreamChunk> {
      if (batch.length === 0) return
      const toForward = batch
      batch = []
      // Tag each forwarded chunk's client-facing SSE `id:` with the offset the
      // BACKEND returned for it — never a transport-local counter. On resume
      // the backend derives seq from this id, so the two must be the same key
      // space. Both bundled backends tag every chunk (`memoryStream` per-chunk;
      // `durableStream` POSTs chunks one-by-one for a per-chunk offset), so a
      // mid-batch reconnect resumes exactly-once. A backend that returned
      // `undefined` for some chunks would leave those without an `id:`.
      const offsets = await durability.append(toForward, batchStart)
      toForward.forEach((chunk, i) => {
        const offset = offsets[i]
        if (offset !== undefined) idByChunk.set(chunk, offset)
      })
      for (const chunk of toForward) yield chunk
    }

    try {
      for await (const chunk of stream) {
        if (abortController?.signal.aborted) break
        if (batch.length === 0) batchStart = seq
        batch.push(chunk)
        seq += 1
        if (batch.length >= batchSize || isDurabilityFlushBoundary(chunk)) {
          yield* flush()
        }
      }
      yield* flush()
    } catch (error) {
      // The provider stream threw. Persist a terminal RUN_ERROR to the
      // durability log so a resumer / joiner learns the run failed (otherwise
      // the log ends with no terminal and they wait forever). Flush any
      // buffered chunks first, then append the terminal WITHOUT forwarding it
      // live — the transport layer synthesizes the live RUN_ERROR on rethrow,
      // so forwarding here too would double-emit.
      yield* flush()
      if (!abortController?.signal.aborted) {
        const errorChunk = {
          type: 'RUN_ERROR',
          timestamp: Date.now(),
          error: toRunErrorPayload(error),
        } as StreamChunk
        await durability.append([errorChunk], seq)
      }
      throw error
    } finally {
      // Unblock any live-tailing join, however the run ended (terminal, thrown,
      // or a source that simply ran dry with no terminal event).
      durability.markComplete?.()
    }
  }

  async function* replay(offset: string): AsyncIterable<StreamChunk> {
    // Thread the consumer's abort signal into the read so a live-tailing join
    // (a mid-stream reconnect) that is aborted — or that hit a runId with no
    // in-process producer — stops parking and ends instead of hanging forever.
    for await (const { seq, chunk } of durability.read(
      offset,
      abortController?.signal,
    )) {
      if (abortController?.signal.aborted) break
      idByChunk.set(chunk, encodeOffset(runId, seq))
      yield chunk
    }
  }

  return {
    source: resumeOffset !== null ? replay(resumeOffset) : produce(),
    getId,
  }
}

/**
 * Convert a StreamChunk async iterable to a Response in Server-Sent Events format
 *
 * This creates a Response that emits chunks in SSE format:
 * - Each chunk is prefixed with "data: "
 * - Each chunk is followed by "\n\n"
 * - Stream ends when the underlying iterable is exhausted (RUN_FINISHED is the terminal event)
 *
 * Pass a `durability` sink (`memoryStream(request)` / `durableStream(request)`)
 * to make the stream resumable: fresh runs are appended to the log and each SSE
 * event is tagged with an `id:` offset; a reconnect (native `Last-Event-ID`) or
 * a `?offset` join replays from the log without re-running the producer. `batch`
 * controls how many chunks are buffered per `append` (default 32).
 *
 * @param stream - AsyncIterable of StreamChunks from chat()
 * @param init - Optional Response initialization options (including `abortController`, `durability`, `batch`)
 * @returns Response in Server-Sent Events format
 *
 * @example
 * ```typescript
 * const stream = chat({ adapter: openaiText(), model: "gpt-5.5", messages: [...] });
 * return toServerSentEventsResponse(stream, { durability: memoryStream(request) });
 * ```
 */
export function toServerSentEventsResponse(
  stream: AsyncIterable<StreamChunk>,
  init?: ResponseInit & {
    abortController?: AbortController
    durability?: StreamDurability
    batch?: number
  },
): Response {
  const { headers, abortController, durability, batch, ...responseInit } =
    init ?? {}

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

  let body: ReadableStream<Uint8Array>
  if (durability) {
    const { source, getId } = durableStreamSource(stream, durability, {
      abortController,
      batch,
    })
    body = toServerSentEventsStream(source, abortController, getId)
  } else {
    body = toServerSentEventsStream(stream, abortController)
  }

  return new Response(body, {
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
      } catch (error: unknown) {
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
              error: toRunErrorPayload(error),
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
 * Pass a `durability` sink to make the stream resumable (same semantics as
 * {@link toServerSentEventsResponse}); ndjson carries no `id:` line, so this
 * relies on the `?offset` query param rather than native `Last-Event-ID`.
 *
 * @param stream - AsyncIterable of StreamChunks from chat()
 * @param init - Optional Response initialization options (including `abortController`, `durability`, `batch`)
 * @returns Response in HTTP stream format (newline-delimited JSON)
 *
 * @example
 * ```typescript
 * const stream = chat({ adapter: openaiText(), model: "gpt-5.5", messages: [...] });
 * return toHttpResponse(stream, { durability: memoryStream(request) });
 * ```
 */
export function toHttpResponse(
  stream: AsyncIterable<StreamChunk>,
  init?: ResponseInit & {
    abortController?: AbortController
    durability?: StreamDurability
    batch?: number
  },
): Response {
  const { abortController, durability, batch, ...responseInit } = init ?? {}

  const body = durability
    ? toHttpStream(
        durableStreamSource(stream, durability, { abortController, batch })
          .source,
        abortController,
      )
    : toHttpStream(stream, abortController)

  return new Response(body, {
    ...responseInit,
  })
}
