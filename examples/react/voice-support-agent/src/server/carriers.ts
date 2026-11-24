import { createAudioConverter } from '@tanstack/ai'
import type { LiveAudioFormat } from '@tanstack/ai'
import type { RawData, WebSocket } from 'ws'

/**
 * A carrier is the thing on the other end of the socket. It knows the audio
 * format the caller sends and how to frame audio and captions going back.
 */
export interface Carrier {
  /** Audio format of the caller's chunks. */
  audio: LiveAudioFormat
  /** Pull caller audio out of one socket frame. Undefined for control frames. */
  audioIn: (data: RawData, isBinary: boolean) => Uint8Array | undefined
  /** Send 24 kHz 16-bit mono PCM to the caller. */
  speak: (pcm24k: Uint8Array) => void
  /** Stop audio that is still playing. The caller started talking. */
  clear: () => void
  /** Show text to the caller, when the carrier has a screen. */
  caption: (role: 'caller' | 'agent', text: string, final: boolean) => void
}

const PCM_24K: LiveAudioFormat = { encoding: 'linear16', sampleRate: 24000 }

/** The softphone page. Binary frames are PCM both ways. Text frames are JSON. */
export function browserCarrier(ws: WebSocket): Carrier {
  return {
    audio: PCM_24K,
    audioIn: (data, isBinary) => (isBinary ? toBytes(data) : undefined),
    speak: (pcm) => ws.send(pcm),
    clear: () => ws.send(JSON.stringify({ type: 'clear' })),
    caption: (role, text, final) =>
      ws.send(JSON.stringify({ type: 'caption', role, text, final })),
  }
}

/**
 * A Twilio Media Stream. Twilio sends JSON text frames with base64 G.711
 * μ-law audio at 8 kHz, and wants the same back. `streamSid` comes from the
 * `start` frame, which the plugin reads before the call starts.
 * https://www.twilio.com/docs/voice/media-streams/websocket-messages
 */
export function twilioCarrier(ws: WebSocket, streamSid: string): Carrier {
  return {
    audio: { encoding: 'mulaw', sampleRate: 8000 },
    audioIn: (data) => {
      const frame = parseTwilioFrame(data)
      return frame?.event === 'media'
        ? Buffer.from(frame.media.payload, 'base64')
        : undefined
    },
    speak: (pcm) => {
      // One converter per clip, so no samples carry into the next clip.
      const toPcm8k = createAudioConverter(PCM_24K, {
        encoding: 'linear16',
        sampleRate: 8000,
      })
      const payload = Buffer.from(toMulaw(toPcm8k(pcm))).toString('base64')
      ws.send(JSON.stringify({ event: 'media', streamSid, media: { payload } }))
    },
    clear: () => ws.send(JSON.stringify({ event: 'clear', streamSid })),
    caption: () => {},
  }
}

type TwilioFrame =
  | {
      event: 'start'
      start: { streamSid: string; customParameters: Record<string, string> }
    }
  | { event: 'media'; media: { payload: string } }

/**
 * Read one Twilio frame. Anyone can open the socket, so check each field
 * before use. Other events and bad frames give undefined.
 */
export function parseTwilioFrame(data: RawData): TwilioFrame | undefined {
  let frame: unknown
  try {
    frame = JSON.parse(toBytes(data).toString())
  } catch {
    return undefined
  }
  if (typeof frame !== 'object' || frame === null || !('event' in frame)) {
    return undefined
  }
  if (frame.event === 'media' && 'media' in frame) {
    const { media } = frame
    if (
      typeof media === 'object' &&
      media !== null &&
      'payload' in media &&
      typeof media.payload === 'string'
    ) {
      return { event: 'media', media: { payload: media.payload } }
    }
  }
  if (frame.event === 'start' && 'start' in frame) {
    const { start } = frame
    if (
      typeof start === 'object' &&
      start !== null &&
      'streamSid' in start &&
      typeof start.streamSid === 'string'
    ) {
      const params =
        'customParameters' in start ? start.customParameters : undefined
      return {
        event: 'start',
        start: {
          streamSid: start.streamSid,
          customParameters: isStringRecord(params) ? params : {},
        },
      }
    }
  }
  return undefined
}

function toBytes(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data
  if (Array.isArray(data)) return Buffer.concat(data)
  return Buffer.from(data)
}

export function isStringRecord(
  value: unknown,
): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.values(value).every((entry) => typeof entry === 'string')
  )
}

/** G.711 μ-law encode of 16-bit little-endian PCM. */
function toMulaw(pcm16: Uint8Array): Uint8Array {
  const view = new DataView(pcm16.buffer, pcm16.byteOffset, pcm16.byteLength)
  const out = new Uint8Array(pcm16.byteLength >> 1)
  for (let i = 0; i < out.length; i++) {
    let sample = view.getInt16(i * 2, true)
    const sign = sample < 0 ? 0x80 : 0
    if (sign) sample = -sample
    sample = Math.min(sample, 32635) + 0x84
    let exponent = 7
    for (let mask = 0x4000; (sample & mask) === 0 && exponent > 0; mask >>= 1) {
      exponent--
    }
    const mantissa = (sample >> (exponent + 3)) & 0x0f
    out[i] = ~(sign | (exponent << 4) | mantissa) & 0xff
  }
  return out
}
