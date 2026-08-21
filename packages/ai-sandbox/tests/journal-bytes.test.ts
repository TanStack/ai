import { describe, expect, it } from 'vitest'
import {
  decodeBase64Stream,
  encodeUtf8Stream,
  toJournalLines,
} from '../src/journal-bytes'
import type { JournalLine } from '../src/journal-bytes'

async function* fromValues<T>(values: Array<T>): AsyncIterable<T> {
  for (const value of values) {
    await Promise.resolve()
    yield value
  }
}

async function collect<T>(it: AsyncIterable<T>): Promise<Array<T>> {
  const out: Array<T> = []
  for await (const value of it) out.push(value)
  return out
}

function b64(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64')
}

async function decodeToText(chunks: Array<string>): Promise<string> {
  const parts = await collect(decodeBase64Stream(fromValues(chunks)))
  const total = parts.reduce((n, p) => n + p.length, 0)
  const joined = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    joined.set(part, at)
    at += part.length
  }
  return new TextDecoder().decode(joined)
}

describe('decodeBase64Stream', () => {
  it('decodes a whole frame delivered in one chunk', async () => {
    expect(await decodeToText([b64('hello world')])).toBe('hello world')
  })

  it('buffers a partial quantum across chunk boundaries', async () => {
    const encoded = b64('the quick brown fox')
    const chunks = [
      encoded.slice(0, 1),
      encoded.slice(1, 6),
      encoded.slice(6, 7),
      encoded.slice(7),
    ]
    expect(await decodeToText(chunks)).toBe('the quick brown fox')
  })

  it('strips the wrapping newlines base64(1) emits every 76 columns', async () => {
    const text = 'x'.repeat(300)
    const wrapped = (b64(text).match(/.{1,76}/g) ?? []).join('\n') + '\n'
    expect(await decodeToText([wrapped])).toBe(text)
  })

  it('round-trips multi-byte UTF-8 split mid-character in the byte stream', async () => {
    const text = 'héllo 🌍 wörld'
    const encoded = b64(text)
    const chunks = [encoded.slice(0, 3), encoded.slice(3, 9), encoded.slice(9)]
    expect(await decodeToText(chunks)).toBe(text)
  })

  it('yields nothing for an empty stream (an absent or empty journal)', async () => {
    expect(await collect(decodeBase64Stream(fromValues<string>([])))).toEqual(
      [],
    )
  })

  it('throws when the frame ends mid-quantum instead of dropping bytes', async () => {
    // A truncated frame means the reader was cut off. Rounding the remainder
    // away would silently lose journal bytes.
    await expect(
      collect(decodeBase64Stream(fromValues([b64('abcdef').slice(0, 5)]))),
    ).rejects.toThrow(/mid-quantum/)
  })
})

describe('encodeUtf8Stream', () => {
  it('turns provider-decoded text back into the journal bytes it came from', async () => {
    const parts = await collect(
      encodeUtf8Stream(fromValues(['{"a":1}\n', '{"t":"café"}\n'])),
    )
    expect(parts.map((p) => p.length)).toEqual([8, 14])
  })

  it('drops empty chunks so the line splitter is not woken for nothing', async () => {
    expect(
      (await collect(encodeUtf8Stream(fromValues(['', 'a', ''])))).map(
        (p) => p.length,
      ),
    ).toEqual([1])
  })

  it('yields nothing for an empty stream (an absent or empty journal)', async () => {
    expect(await collect(encodeUtf8Stream(fromValues<string>([])))).toEqual([])
  })

  it('composes with toJournalLines to give byte-exact positions', async () => {
    // What the follow path actually does. 'é' is 2 bytes, so the first line is
    // 13 bytes + newline even though it is 12 UTF-16 code units.
    const lines = await collect(
      toJournalLines(
        encodeUtf8Stream(fromValues(['{"t":"caf', 'é"}\n{"b":2}\n'])),
        0,
      ),
    )
    expect(lines).toEqual<Array<JournalLine>>([
      { line: '{"t":"café"}', endPosition: 14 },
      { line: '{"b":2}', endPosition: 22 },
    ])
  })
})

describe('toJournalLines', () => {
  function bytes(text: string): Uint8Array {
    return new TextEncoder().encode(text)
  }

  it('reports the byte position just past each newline', async () => {
    const lines = await collect(
      toJournalLines(fromValues([bytes('{"a":1}\n{"b":2}\n')]), 0),
    )
    expect(lines).toEqual<Array<JournalLine>>([
      { line: '{"a":1}', endPosition: 8 },
      { line: '{"b":2}', endPosition: 16 },
    ])
  })

  it('offsets positions by startPosition so a resumed read stays absolute', async () => {
    const lines = await collect(
      toJournalLines(fromValues([bytes('{"a":1}\n')]), 1_000),
    )
    expect(lines).toEqual<Array<JournalLine>>([
      { line: '{"a":1}', endPosition: 1_008 },
    ])
  })

  it('counts bytes, not characters, for multi-byte content', async () => {
    // '🌍' is 4 bytes; the line is 1 + 4 + 1 = 6 bytes plus the newline.
    const lines = await collect(
      toJournalLines(fromValues([bytes('["🌍"]\n')]), 0),
    )
    expect(lines).toEqual<Array<JournalLine>>([
      { line: '["🌍"]', endPosition: 9 },
    ])
  })

  it('reassembles a line split across byte chunks, including mid-character', async () => {
    const all = bytes('{"t":"é"}\n{"u":2}\n')
    const chunks = [all.subarray(0, 7), all.subarray(7, 8), all.subarray(8)]
    const lines = await collect(toJournalLines(fromValues(chunks), 0))
    expect(lines.map((l) => l.line)).toEqual(['{"t":"é"}', '{"u":2}'])
    expect(lines.at(-1)?.endPosition).toBe(all.length)
  })

  it('does NOT yield a trailing unterminated line', async () => {
    // The agent is mid-write. Yielding it would emit truncated JSON and advance
    // the position past bytes the next read must re-see.
    const lines = await collect(
      toJournalLines(fromValues([bytes('{"a":1}\n{"partial"')]), 0),
    )
    expect(lines).toEqual<Array<JournalLine>>([
      { line: '{"a":1}', endPosition: 8 },
    ])
  })

  it('yields an empty line for a bare newline rather than skipping its byte', async () => {
    const lines = await collect(toJournalLines(fromValues([bytes('\na\n')]), 0))
    expect(lines).toEqual<Array<JournalLine>>([
      { line: '', endPosition: 1 },
      { line: 'a', endPosition: 3 },
    ])
  })
})
