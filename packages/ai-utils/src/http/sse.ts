/** One server-sent event. */
export interface ServerSentEvent {
  event?: string
  data: string
  id?: string
  retry?: number
}

/**
 * Reads a `text/event-stream` response body as server-sent events.
 *
 * Follows the same rules as the OpenAI and Anthropic SDK decoders:
 *
 * - Lines end with `\r\n`, `\n`, or `\r`, and can split at any byte.
 * - Many `data:` lines in one event are joined with `\n`.
 * - Lines that start with `:` are comments and are skipped.
 * - One space after the field colon is removed.
 * - An event is sent when it has an `event` or `data` field. A last event
 *   with no blank line after it is still sent at the end of the body.
 *
 * When `signal` aborts, the body reader is cancelled and iteration ends with
 * no error.
 *
 * @example
 * for await (const { event, data } of parseSSE(response, signal)) {
 *   if (data === '[DONE]') break
 * }
 */
export async function* parseSSE(response: Response, signal?: AbortSignal) {
  if (!response.body) {
    throw new Error('Attempted to iterate over a response with no body')
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const cancel = () => {
    reader.cancel().catch(() => {})
  }
  signal?.addEventListener('abort', cancel, { once: true })

  let pending: Partial<ServerSentEvent> = {}
  let data: Array<string> = []
  // Ends one line. Returns an event when the line is blank and an event is
  // waiting.
  const readLine = (line: string) => {
    if (line === '') {
      if (pending.event === undefined && data.length === 0) return undefined
      const sse: ServerSentEvent = { ...pending, data: data.join('\n') }
      pending = {}
      data = []
      return sse
    }
    if (line.startsWith(':')) return undefined
    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    let value = colon === -1 ? '' : line.slice(colon + 1)
    if (value.startsWith(' ')) value = value.slice(1)
    if (field === 'event') pending.event = value
    else if (field === 'data') data.push(value)
    else if (field === 'id') pending.id = value
    else if (field === 'retry' && /^\d+$/.test(value)) pending.retry = +value
    return undefined
  }

  let buffer = ''
  // Index in `buffer` where the next scan starts. The text before it holds
  // no line end.
  let scanned = 0
  // True when the last chunk ended with `\r`, so a `\n` at the start of the
  // next chunk belongs to that line ending.
  let skipLeadingLF = false
  let ended = false
  try {
    while (!signal?.aborted) {
      const { value, done } = await reader.read()
      ended = done
      if (done || signal?.aborted) break
      let text = decoder.decode(value, { stream: true })
      if (skipLeadingLF && text.startsWith('\n')) text = text.slice(1)
      if (text) skipLeadingLF = false
      buffer += text
      let start = 0
      for (let i = scanned; i < buffer.length; i++) {
        const char = buffer[i]
        if (char !== '\n' && char !== '\r') continue
        const sse = readLine(buffer.slice(start, i))
        if (char === '\r' && buffer[i + 1] === '\n') i++
        else if (char === '\r' && i === buffer.length - 1) skipLeadingLF = true
        start = i + 1
        if (sse) yield sse
        if (signal?.aborted) return
      }
      if (start > 0) buffer = buffer.slice(start)
      scanned = buffer.length
    }
    if (!ended) return
    const rest = buffer + decoder.decode()
    if (rest) readLine(rest)
    const last = readLine('')
    if (last) yield last
  } finally {
    signal?.removeEventListener('abort', cancel)
    if (!ended) cancel()
    reader.releaseLock()
  }
}
