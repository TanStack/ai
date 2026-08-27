const NEWLINE = 0x0a

/** Decode one complete base64 quantum group to bytes. */
function decodeQuantumGroup(group: string): Uint8Array {
  const binary = atob(group)
  const out = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    out[index] = binary.charCodeAt(index)
  }
  return out
}

export async function* decodeBase64Stream(
  chunks: AsyncIterable<string>,
): AsyncIterable<Uint8Array> {
  let pending = ''
  for await (const chunk of chunks) {
    pending += chunk.replace(/\s+/g, '')
    const usable = pending.length - (pending.length % 4)
    if (usable === 0) continue
    const group = pending.slice(0, usable)
    pending = pending.slice(usable)
    yield decodeQuantumGroup(group)
  }
  if (pending.length > 0) {
    throw new Error(
      `journal: base64 frame ended mid-quantum with ${pending.length} character(s) pending`,
    )
  }
}

export async function* encodeUtf8Stream(
  chunks: AsyncIterable<string>,
): AsyncIterable<Uint8Array> {
  const encoder = new TextEncoder()
  for await (const chunk of chunks) {
    if (chunk.length === 0) continue
    yield encoder.encode(chunk)
  }
}

/** One complete journal line plus the absolute byte position just past its newline. */
export interface JournalLine {
  /** The line's text, newline excluded. */
  line: string
  endPosition: number
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const out = new Uint8Array(left.length + right.length)
  out.set(left, 0)
  out.set(right, left.length)
  return out
}

export async function* toJournalLines(
  byteChunks: AsyncIterable<Uint8Array>,
  startPosition: number,
): AsyncIterable<JournalLine> {
  const decoder = new TextDecoder()
  let buffer: Uint8Array = new Uint8Array(0)
  let position = startPosition
  for await (const bytes of byteChunks) {
    buffer = concatBytes(buffer, bytes)
    let newline = buffer.indexOf(NEWLINE)
    while (newline !== -1) {
      const lineBytes = buffer.subarray(0, newline)
      position += newline + 1
      yield { line: decoder.decode(lineBytes), endPosition: position }
      buffer = buffer.slice(newline + 1)
      newline = buffer.indexOf(NEWLINE)
    }
  }
}
