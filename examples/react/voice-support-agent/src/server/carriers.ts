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
 * μ-law audio at 8 kHz, and wants the same back.
 * https://www.twilio.com/docs/voice/media-streams/websocket-messages
 */
export function twilioCarrier(ws: WebSocket): Carrier {
  let streamSid = ''
  const toPcm8k = createAudioConverter(PCM_24K, {
    encoding: 'linear16',
    sampleRate: 8000,
  })
  return {
    audio: { encoding: 'mulaw', sampleRate: 8000 },
    audioIn: (data) => {
      let frame: unknown
      try {
        frame = JSON.parse(toBytes(data).toString())
      } catch {
        // Twilio only sends JSON. Anything else is not a Media Stream.
        ws.close(1003, 'expected a Twilio Media Stream frame')
        return undefined
      }
      if (!isTwilioFrame(frame)) return undefined
      if (frame.event === 'start') streamSid = frame.start.streamSid
      if (frame.event === 'media') {
        return Buffer.from(frame.media.payload, 'base64')
      }
      return undefined
    },
    speak: (pcm) => {
      const payload = Buffer.from(toMulaw(toPcm8k(pcm))).toString('base64')
      ws.send(JSON.stringify({ event: 'media', streamSid, media: { payload } }))
    },
    clear: () => ws.send(JSON.stringify({ event: 'clear', streamSid })),
    caption: () => {},
  }
}

type TwilioFrame =
  | { event: 'start'; start: { streamSid: string } }
  | { event: 'media'; media: { payload: string } }
  | { event: 'stop' }

function isTwilioFrame(value: unknown): value is TwilioFrame {
  return (
    typeof value === 'object' &&
    value !== null &&
    'event' in value &&
    typeof value.event === 'string'
  )
}

function toBytes(data: RawData): Buffer {
  if (Buffer.isBuffer(data)) return data
  if (Array.isArray(data)) return Buffer.concat(data)
  return Buffer.from(data)
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
