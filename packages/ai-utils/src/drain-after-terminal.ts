/** Responses API events after which the stream has nothing more to send. */
const TERMINAL_EVENTS = new Set([
  'response.completed',
  'response.failed',
  'response.incomplete',
  'error',
])

/** How long the body may take to end by itself once a terminal event is read. */
const DRAIN_AFTER_TERMINAL_MS = 250

/**
 * Yields the events of a Responses API stream.
 *
 * The adapters stop reading at a terminal event and do not wait for the HTTP
 * body to close (#1445). If that stop cancels the request at once, a gateway
 * logs the finished call as a client cancel (499, #1965). So when the
 * consumer stops right after a terminal event, the rest of the body is read
 * in the background. The request is stopped only if the body has not ended
 * after `DRAIN_AFTER_TERMINAL_MS`.
 *
 * A `ReadableStream` is read with a reader, and stopped with `reader.cancel()`.
 * Any other stream is stopped with `abort`. The OpenAI SDK `Stream` needs it,
 * because its iterator queues `return()` behind a pending read. Without
 * `abort`, the stream closes at once, as it would without this helper.
 *
 * A stop on a non-terminal event closes the stream at once.
 */
export async function* drainAfterTerminal<T>(
  stream: AsyncIterable<T>,
  eventType: (event: T) => string | undefined,
  abort?: () => void,
): AsyncGenerator<T> {
  const source = open(stream, abort)
  let ended = false
  let lastWasTerminal = false
  try {
    for (;;) {
      const step = await source.next()
      if (step.done) {
        ended = true
        return
      }
      lastWasTerminal = TERMINAL_EVENTS.has(eventType(step.value) ?? '')
      yield step.value
    }
  } catch (error) {
    ended = true
    throw error
  } finally {
    if (ended) {
      source.release()
    } else if (lastWasTerminal && source.stop) {
      const timer = setTimeout(source.stop, DRAIN_AFTER_TERMINAL_MS)
      void (async () => {
        try {
          while (!(await source.next()).done) {
            // discard: the response is already complete
          }
        } catch {
          // the body failed after the response was complete, nothing to report
        } finally {
          clearTimeout(timer)
        }
      })()
    } else {
      await source.close()
    }
  }
}

function open<T>(stream: AsyncIterable<T>, abort: (() => void) | undefined) {
  if (stream instanceof ReadableStream) {
    const reader: ReadableStreamDefaultReader<T> = stream.getReader()
    const cancel = () => reader.cancel().catch(() => {})
    return {
      next: (): Promise<IteratorResult<T, unknown>> => reader.read(),
      close: cancel,
      stop: () => void cancel(),
      release: () => reader.releaseLock(),
    }
  }
  const iterator = stream[Symbol.asyncIterator]()
  return {
    next: (): Promise<IteratorResult<T, unknown>> => iterator.next(),
    close: async () => {
      await iterator.return?.()
    },
    stop: abort,
    release: () => {},
  }
}
