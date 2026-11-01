---
title: "Live Transcription: Advanced"
id: live-transcription-advanced
order: 6
description: "Audio formats, automatic conversion, provider options, cancellation, and custom adapters for transcriptionSession()."
keywords:
  - tanstack ai
  - live transcription
  - mulaw
  - alaw
  - pcm
  - audio conversion
  - custom adapter
---

Set `audio` to the format of the chunks you send. Each adapter lists the formats it takes in `adapter.audioInputs`, and the session converts anything else to PCM.

This page builds on [Live Transcription](./live-transcription).

## Audio formats

`audio.encoding` takes three values:

- `mulaw`: G.711 μ-law. Twilio, Telnyx, Plivo, and Vonage send this in North America.
- `alaw`: G.711 A-law. Most carriers outside North America send this.
- `linear16`: 16-bit signed little-endian PCM, at any sample rate.

Set `sampleRate` (8000 for a phone call), and `channels` when the audio is not mono:

```typescript
import { transcriptionSession } from '@tanstack/ai'
import { elevenlabsLiveTranscription } from '@tanstack/ai-elevenlabs'

const session = await transcriptionSession({
  adapter: elevenlabsLiveTranscription('scribe_v2_realtime'),
  audio: { encoding: 'linear16', sampleRate: 16000, channels: 1 },
})
```

`send()` takes a base64 string, a `Uint8Array`, or an `ArrayBuffer`. A string is read as base64, which is what carriers send.

## Automatic conversion

When the adapter does not take your format, the session decodes G.711 to PCM. It also resamples PCM to a rate the provider takes. The adapter only gets audio it can use.

| Input            | Gemini gets      | OpenAI gets      |
| ---------------- | ---------------- | ---------------- |
| `mulaw`, 8 kHz   | PCM, 16 kHz      | `mulaw`, 8 kHz   |
| `linear16`, 16 kHz | PCM, 16 kHz    | PCM, 24 kHz      |

To convert audio yourself, for example before you record it, use `createAudioConverter()`. Keep one converter per stream, because it carries state between chunks:

```typescript
import { createAudioConverter } from '@tanstack/ai'

const toPcm = createAudioConverter(
  { encoding: 'mulaw', sampleRate: 8000 },
  { encoding: 'linear16', sampleRate: 16000 },
)

const pcm = toPcm(new Uint8Array([0xff, 0x7f]))
```

## Provider options

Pass provider settings in `modelOptions`. The type follows the adapter.

Deepgram Nova-3, with a turn-end after one second of no new words:

```typescript
import { transcriptionSession } from '@tanstack/ai'
import { deepgramLiveTranscription } from '@tanstack/ai-deepgram'

const session = await transcriptionSession({
  adapter: deepgramLiveTranscription('nova-3'),
  audio: { encoding: 'mulaw', sampleRate: 8000 },
  modelOptions: { utteranceEndMs: 1000, smartFormat: true, keyterms: ['TanStack'] },
})
```

Deepgram Flux detects turns itself. Tune it with `eotThreshold` and `eotTimeoutMs`:

```typescript
import { transcriptionSession } from '@tanstack/ai'
import { deepgramLiveTranscription } from '@tanstack/ai-deepgram'

const session = await transcriptionSession({
  adapter: deepgramLiveTranscription('flux-general-en'),
  audio: { encoding: 'linear16', sampleRate: 16000 },
  modelOptions: { eotThreshold: 0.8 },
})
```

`turn-end` support differs by provider:

- Deepgram, ElevenLabs, xAI, and Gemini send `turn-end` when the speaker pauses.
- OpenAI sends it with `gpt-transcribe` and the `gpt-4o-*` models, which detect voice activity.
- OpenAI `gpt-live-transcribe` streams text with no `turn-end`. It sends one `final` when the session closes.

## Stop a session

`close()` flushes the last text, then ends the event loop. To stop at a deadline or when a request ends, pass an `abortSignal`:

```typescript
import { transcriptionSession } from '@tanstack/ai'
import { grokLiveTranscription } from '@tanstack/ai-grok'

const session = await transcriptionSession({
  adapter: grokLiveTranscription('grok-voice-transcribe-2.0'),
  audio: { encoding: 'alaw', sampleRate: 8000 },
  abortSignal: AbortSignal.timeout(30 * 60 * 1000),
})
```

A `break` out of the `for await` loop also closes the session.

## Write an adapter

An adapter has a name, a model, the audio formats it takes, and a `connect()` function. `connect()` opens the provider connection, and calls `emit()` for each event and `end()` once when the connection is gone:

```typescript
import { transcriptionSession } from '@tanstack/ai'
import type { LiveTranscriptionAdapter } from '@tanstack/ai'

function echoTranscription(): LiveTranscriptionAdapter<'echo'> {
  return {
    kind: 'liveTranscription',
    name: 'echo',
    model: 'echo',
    audioInputs: [{ encoding: 'linear16', sampleRates: [16000] }],
    '~types': { providerOptions: {} },
    connect: async ({ emit, end }) => ({
      send: (audio) => emit({ type: 'interim', text: `${audio.length} bytes` }),
      close: async () => {
        emit({ type: 'turn-end' })
        end()
      },
    }),
  }
}

const session = await transcriptionSession({
  adapter: echoTranscription(),
  audio: { encoding: 'mulaw', sampleRate: 8000 },
})
```

For a WebSocket provider, `openLiveSocket()` from `@tanstack/ai/adapter-internals` opens the socket, parses JSON frames, reports unexpected closes as `error` events, and calls `end()`.

To test an adapter with no network, pass the `WebSocket` from `fakeWebSocket()` in `@tanstack/ai/testing`. Then drive each socket by hand:

```typescript
import { transcriptionSession } from '@tanstack/ai'
import { fakeWebSocket } from '@tanstack/ai/testing'
import { deepgramLiveTranscription } from '@tanstack/ai-deepgram'

const ws = fakeWebSocket()
const opening = transcriptionSession({
  adapter: deepgramLiveTranscription('nova-3', { apiKey: 'test', WebSocket: ws.WebSocket }),
  audio: { encoding: 'mulaw', sampleRate: 8000 },
})
ws.sockets[0]?.open()
const session = await opening
ws.sockets[0]?.receive({
  type: 'Results',
  is_final: true,
  channel: { alternatives: [{ transcript: 'hello' }] },
})
```

The session now yields `{ type: 'final', text: 'hello' }`.
