/** The synthesis request fixes the output to mono PCM16 at 24 kHz. */
export const SAMPLE_RATE = 24000
const MAX_RESPONSE_BYTES = 32 * 1024 * 1024
type AudioFormat = 'pcm' | 'wav' | undefined
type RecordObject = Record<string, unknown>

function object(value: unknown): RecordObject {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('60db returned an invalid response object')
  }
  return value as RecordObject
}

function metadata(value: RecordObject, inherited: AudioFormat): AudioFormat {
  if (value.success === false || value.type === 'error' || value.error) {
    throw new Error('60db reported a synthesis error')
  }
  let format = inherited
  for (const key of ['encoding', 'audio_encoding', 'output_format']) {
    if (value[key] == null) continue
    const encoding = String(value[key]).toLowerCase()
    if (!['pcm', 'pcm16', 'linear16', 'wav'].includes(encoding)) {
      throw new Error('60db returned incompatible audio encoding')
    }
    // A WAV container can also declare LINEAR16 as its sample encoding.
    if (encoding === 'wav') format = 'wav'
    else if (format !== 'wav') format = 'pcm'
  }
  for (const [key, expected] of [
    ['sample_rate', SAMPLE_RATE],
    ['sample_rate_hertz', SAMPLE_RATE],
    ['channels', 1],
    ['bit_depth', 16],
  ] as const) {
    if (value[key] != null && value[key] !== expected) {
      throw new Error('60db returned incompatible audio metadata')
    }
  }
  if (value.audio_config != null) {
    format = metadata(object(value.audio_config), format)
  }
  return format
}

function concatenate(parts: Array<Uint8Array>): Uint8Array {
  const bytes = new Uint8Array(
    parts.reduce((size, part) => size + part.length, 0),
  )
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.length
  }
  return bytes
}

function decodeBase64(value: unknown): Uint8Array {
  if (
    typeof value !== 'string' ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  ) {
    throw new Error('60db returned invalid base64 audio')
  }
  return Uint8Array.from(atob(value), (char) => char.charCodeAt(0))
}

function tag(bytes: Uint8Array, offset: number, text: string): boolean {
  return [...text].every(
    (char, index) => bytes[offset + index] === char.charCodeAt(0),
  )
}

function pcm(bytes: Uint8Array, format: AudioFormat): Uint8Array {
  // Declared PCM is authoritative; sample bytes can begin with any file signature.
  if (format === 'pcm') return bytes
  if (format !== 'wav' && !tag(bytes, 0, 'RIFF')) {
    if (['ID3', 'OggS', 'fLaC'].some((prefix) => tag(bytes, 0, prefix))) {
      throw new Error('60db returned compressed audio instead of PCM')
    }
    return bytes
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const parts: Array<Uint8Array> = []
  let offset = 0
  while (offset < bytes.length) {
    if (
      offset + 12 > bytes.length ||
      !tag(bytes, offset, 'RIFF') ||
      !tag(bytes, offset + 8, 'WAVE')
    ) {
      throw new Error('60db returned invalid WAV framing')
    }
    const end = offset + 8 + view.getUint32(offset + 4, true)
    if (end > bytes.length || end < offset + 12) {
      throw new Error('60db returned truncated WAV audio')
    }
    let cursor = offset + 12
    let hasFormat = false
    let hasAudio = false
    while (cursor + 8 <= end) {
      const size = view.getUint32(cursor + 4, true)
      const start = cursor + 8
      if (start + size > end)
        throw new Error('60db returned a truncated WAV chunk')
      if (tag(bytes, cursor, 'fmt ')) {
        if (
          size < 16 ||
          view.getUint16(start, true) !== 1 ||
          view.getUint16(start + 2, true) !== 1 ||
          view.getUint32(start + 4, true) !== SAMPLE_RATE ||
          view.getUint32(start + 8, true) !== SAMPLE_RATE * 2 ||
          view.getUint16(start + 12, true) !== 2 ||
          view.getUint16(start + 14, true) !== 16
        ) {
          throw new Error('60db WAV must be mono PCM16 at 24000 Hz')
        }
        hasFormat = true
      }
      if (tag(bytes, cursor, 'data')) {
        if (!hasFormat || size % 2 !== 0)
          throw new Error('60db returned invalid WAV samples')
        parts.push(bytes.subarray(start, start + size))
        hasAudio = true
      }
      cursor = start + size + (size % 2)
    }
    if (!hasFormat || !hasAudio || cursor !== end) {
      throw new Error('60db returned incomplete WAV audio')
    }
    offset = end
  }
  return concatenate(parts)
}

/** Read and validate an HTTP synthesis response without following audio URLs. */
export async function readAudio(response: Response): Promise<Uint8Array> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error('60db returned an empty response')
  const chunks: Array<Uint8Array> = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > MAX_RESPONSE_BYTES)
        throw new Error('60db audio response exceeded 32 MiB')
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
  const body = concatenate(chunks)
  const mime = response.headers
    .get('content-type')
    ?.split(';')[0]
    ?.trim()
    .toLowerCase()
  let audio: Uint8Array
  if (mime === 'audio/pcm') audio = pcm(body, 'pcm')
  else if (mime === 'audio/wav' || mime === 'audio/x-wav')
    audio = pcm(body, 'wav')
  else if (mime === 'application/octet-stream') audio = pcm(body, undefined)
  else {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(body)
    const records: Array<unknown> = []
    if (mime === 'application/json') records.push(JSON.parse(text))
    else if (mime === 'text/event-stream') {
      for (const event of text.split(/\r?\n\r?\n/)) {
        const data = event
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n')
        if (data && data !== '[DONE]') records.push(JSON.parse(data))
      }
    } else if (
      ['application/x-ndjson', 'application/ndjson', 'text/plain'].includes(
        mime ?? '',
      )
    ) {
      for (const line of text.split(/\r?\n/)) {
        if (line.trim() && line.trim() !== '[DONE]')
          records.push(JSON.parse(line))
      }
    } else throw new Error('60db returned an unsupported audio content type')

    const parts: Array<Uint8Array> = []
    let pending: Array<Uint8Array> = []
    let format: AudioFormat
    const flush = () => {
      if (pending.length) parts.push(pcm(concatenate(pending), format))
      pending = []
    }
    const append = (raw: unknown, depth = 0) => {
      if (depth > 8) throw new Error('60db returned a nested audio envelope')
      const record = object(raw)
      const result = object(record.result ?? record.backendResponse ?? record)
      const declared = metadata(result, metadata(record, undefined))
      if (declared !== undefined && declared !== format) {
        flush()
        format = declared
      }
      const value = result.audioContent ?? result.audio_base64
      if (value == null) return
      const bytes = decodeBase64(value)
      if (bytes[0] === 123 && format === undefined) {
        // Some responses wrap the first audio record in a base64 JSON envelope.
        let inner: unknown
        try {
          inner = JSON.parse(
            new TextDecoder('utf-8', { fatal: true }).decode(bytes),
          )
        } catch {
          /* PCM can begin with a brace. */
        }
        if (inner !== undefined) {
          const nested = object(inner)
          if (
            !['audioContent', 'audio_base64', 'result', 'backendResponse'].some(
              (key) => key in nested,
            )
          ) {
            throw new Error('60db audio envelope contains no audio')
          }
          append(nested, depth + 1)
          return
        }
      }
      pending.push(bytes)
    }
    for (const record of records) append(record)
    flush()
    audio = concatenate(parts)
  }
  if (!audio.length || audio.length % 2 !== 0)
    throw new Error('60db returned empty or incomplete PCM16 audio')
  return audio
}

/** Wrap little-endian PCM16 samples in a browser-playable RIFF/WAV file. */
export function asWav(samples: Uint8Array): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(44 + samples.length)
  const view = new DataView(bytes.buffer)
  const encoder = new TextEncoder()
  bytes.set(encoder.encode('RIFF'), 0)
  view.setUint32(4, 36 + samples.length, true)
  bytes.set(encoder.encode('WAVEfmt '), 8)
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, SAMPLE_RATE, true)
  view.setUint32(28, SAMPLE_RATE * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  bytes.set(encoder.encode('data'), 36)
  view.setUint32(40, samples.length, true)
  bytes.set(samples, 44)
  return bytes
}
