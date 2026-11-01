import type { LiveAudioFormat, LiveAudioInput } from './adapter'

// ITU-T G.711 decode tables (same arithmetic as the reference g711.c).
const MULAW = new Int16Array(256)
const ALAW = new Int16Array(256)
for (let i = 0; i < 256; i++) {
  const u = ~i & 0xff
  const t = (((u & 0x0f) << 3) + 0x84) << ((u & 0x70) >> 4)
  MULAW[i] = u & 0x80 ? 0x84 - t : t - 0x84

  const a = i ^ 0x55
  const seg = (a & 0x70) >> 4
  let s = (a & 0x0f) << 4
  s = seg === 0 ? s + 8 : (s + 0x108) << (seg - 1)
  ALAW[i] = a & 0x80 ? s : -s
}

/**
 * Pick the format to send to a provider. Keep the input format when the
 * provider takes it. Otherwise use `linear16`, at the input rate when the
 * provider takes that rate, else at the nearest higher accepted rate.
 */
export function pickAudioFormat(
  input: LiveAudioFormat,
  accepted: ReadonlyArray<LiveAudioInput>,
): LiveAudioFormat {
  const takesRate = (a: LiveAudioInput, rate: number) =>
    !a.sampleRates || a.sampleRates.includes(rate)
  if (
    accepted.some(
      (a) => a.encoding === input.encoding && takesRate(a, input.sampleRate),
    )
  ) {
    return input
  }
  const pcm = accepted.find((a) => a.encoding === 'linear16')
  if (!pcm) {
    throw new Error(
      `The adapter does not take ${input.encoding} audio at ${input.sampleRate} Hz, and does not take linear16 audio.`,
    )
  }
  const rates = pcm.sampleRates
  const sampleRate =
    !rates || rates.includes(input.sampleRate)
      ? input.sampleRate
      : (rates.find((r) => r >= input.sampleRate) ?? rates[rates.length - 1]!)
  return { ...input, encoding: 'linear16', sampleRate }
}

/**
 * Create a stateful chunk converter from one live audio format to another.
 * The output is always `linear16` unless the formats are the same, in which
 * case chunks pass through unchanged. Keep one converter per stream: it carries
 * odd bytes and resampler position across chunks.
 *
 * @example
 * ```ts
 * const toPcm = createAudioConverter(
 *   { encoding: 'mulaw', sampleRate: 8000 },
 *   { encoding: 'linear16', sampleRate: 16000 },
 * )
 * const pcm = toPcm(twilioChunk)
 * ```
 */
export function createAudioConverter(
  from: LiveAudioFormat,
  to: LiveAudioFormat,
): (chunk: Uint8Array) => Uint8Array {
  if (
    from.encoding === to.encoding &&
    from.sampleRate === to.sampleRate &&
    (from.channels ?? 1) === (to.channels ?? 1)
  ) {
    return (chunk) => chunk
  }
  if (to.encoding !== 'linear16') {
    throw new Error(`Cannot convert audio to ${to.encoding}. Use linear16.`)
  }
  if ((from.channels ?? 1) !== (to.channels ?? 1)) {
    throw new Error('Cannot change the channel count of live audio.')
  }
  const channels = from.channels ?? 1
  const step = from.sampleRate / to.sampleRate
  let carry: number | undefined
  // Resampler state: position in input frames from the start of the next chunk
  // (-1 points at `prev`, the last frame of the previous chunk).
  let pos = 0
  let prev: Int16Array | undefined

  const decode = (chunk: Uint8Array): Int16Array => {
    if (from.encoding !== 'linear16') {
      const table = from.encoding === 'mulaw' ? MULAW : ALAW
      return Int16Array.from(chunk, (b) => table[b]!)
    }
    let bytes = chunk
    if (carry !== undefined) {
      bytes = new Uint8Array(chunk.length + 1)
      bytes[0] = carry
      bytes.set(chunk, 1)
      carry = undefined
    }
    if (bytes.length % 2) carry = bytes[bytes.length - 1]
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const out = new Int16Array(bytes.length >> 1)
    for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true)
    return out
  }

  // ponytail: linear interpolation with no low-pass filter. Fine for upsampling
  // and for speech-to-text; add a filter if downsampling quality matters.
  const resample = (input: Int16Array): Int16Array => {
    if (step === 1) return input
    const frames = input.length / channels
    const out: Array<number> = []
    const at = (frame: number, c: number) =>
      frame < 0 ? prev![c]! : input[frame * channels + c]!
    while (Math.floor(pos) + 1 < frames) {
      const i = Math.floor(pos)
      const frac = pos - i
      for (let c = 0; c < channels; c++) {
        const a = at(i, c)
        out.push(Math.round(a + (at(i + 1, c) - a) * frac))
      }
      pos += step
    }
    if (frames > 0) {
      pos -= frames
      prev = input.slice((frames - 1) * channels, frames * channels)
    }
    return Int16Array.from(out)
  }

  return (chunk) => {
    const samples = resample(decode(chunk))
    const out = new Uint8Array(samples.length * 2)
    const view = new DataView(out.buffer)
    for (let i = 0; i < samples.length; i++)
      view.setInt16(i * 2, samples[i]!, true)
    return out
  }
}
