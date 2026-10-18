const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** True for a byte in the middle of a UTF-8 character (`10xxxxxx`). */
const isContinuation = (byte: number) => (byte & 0xc0) === 0x80

/**
 * The newest output of a command, at most `maxBytes` bytes. When more comes,
 * the oldest bytes are dropped. `text()` gives the output as UTF-8 text, and
 * starts with a line that tells how many bytes were dropped.
 *
 * The `ai-sandbox` package has a copy of this function in
 * `workspace-backend.ts`. Change both.
 *
 * @example
 * ```ts
 * const output = createOutputTail(1024 * 1024)
 * child.stdout.on('data', output.push)
 * output.text() // '[12 earlier bytes were dropped.]\n...'
 * ```
 */
export function createOutputTail(maxBytes: number) {
  // The chunks from `start` on are the output. The ones before are dropped.
  const chunks: Array<Uint8Array> = []
  let start = 0
  let size = 0
  let dropped = 0

  const push = (chunk: Uint8Array | string) => {
    const bytes = typeof chunk === 'string' ? encoder.encode(chunk) : chunk
    // A copy of the end only, so a big chunk is not kept whole.
    const kept = bytes.byteLength > maxBytes ? bytes.slice(-maxBytes) : bytes
    dropped += bytes.byteLength - kept.byteLength
    chunks.push(kept)
    size += kept.byteLength
    while (size > maxBytes) {
      const first = chunks[start]
      if (first === undefined) break
      const over = size - maxBytes
      const cut = Math.min(over, first.byteLength)
      if (cut === first.byteLength) start += 1
      else chunks[start] = first.subarray(cut)
      size -= cut
      dropped += cut
    }
    // Remove the dropped chunks from the array now and then, not each time.
    if (start > 1024 && start * 2 > chunks.length) {
      chunks.splice(0, start)
      start = 0
    }
  }

  const text = () => {
    let bytes = Buffer.concat(chunks.slice(start))
    if (dropped === 0) return decoder.decode(bytes)
    // The cut can be in a character. Start at the next whole one.
    let from = 0
    while (from < 3 && from < bytes.length && isContinuation(bytes[from] ?? 0))
      from += 1
    bytes = bytes.subarray(from)
    return `[${dropped + from} earlier bytes were dropped.]\n${decoder.decode(bytes)}`
  }

  return { push, text }
}
