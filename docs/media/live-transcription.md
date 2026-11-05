---
title: Live Transcription
id: live-transcription
order: 5
description: "Turn live audio into text on the server with transcriptionSession(). Feed phone calls from Twilio, Telnyx, or Vonage, get text while the caller talks, and hand each turn to chat()."
keywords:
  - tanstack ai
  - live transcription
  - streaming speech-to-text
  - telephony
  - twilio
  - voice agent
  - transcriptionSession
  - deepgram
---

Call `transcriptionSession()` to open a live speech-to-text connection on the server. Send audio chunks as they arrive, and read text events while the speaker talks.

It runs on Node, Bun, Cloudflare Workers, and Durable Objects. For a file that is already recorded, use [Transcription](./transcription) instead.

## Transcribe a phone call

You need a Twilio number with a [Media Stream](https://www.twilio.com/docs/voice/media-streams) that connects to your server over a WebSocket, and a Deepgram API key. This takes about 10 minutes.

1. Install the packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-deepgram @tanstack/ai-openai
vue: @tanstack/ai @tanstack/ai-deepgram @tanstack/ai-openai
solid: @tanstack/ai @tanstack/ai-deepgram @tanstack/ai-openai
svelte: @tanstack/ai @tanstack/ai-deepgram @tanstack/ai-openai
preact: @tanstack/ai @tanstack/ai-deepgram @tanstack/ai-openai
angular: @tanstack/ai @tanstack/ai-deepgram @tanstack/ai-openai
octane: @tanstack/ai @tanstack/ai-deepgram @tanstack/ai-openai
vanilla: @tanstack/ai @tanstack/ai-deepgram @tanstack/ai-openai

<!-- ::end:tabs -->

2. Put your keys in `.env`:

```bash
DEEPGRAM_API_KEY=...
OPENAI_API_KEY=sk-...
```

3. Read the audio out of each Twilio message. Twilio sends JSON text frames. A `media` frame holds base64 G.711 μ-law audio at 8 kHz:

```typescript
// twilio.ts
export function mediaPayload(data: unknown): string | undefined {
  if (typeof data !== 'string') return undefined
  const message: unknown = JSON.parse(data)
  if (
    typeof message === 'object' &&
    message !== null &&
    'media' in message &&
    typeof message.media === 'object' &&
    message.media !== null &&
    'payload' in message.media &&
    typeof message.media.payload === 'string'
  ) {
    return message.media.payload
  }
  return undefined
}
```

4. Open a session when the call connects. Send each payload to it, and close it when the call ends:

```typescript
import { transcriptionSession } from '@tanstack/ai'
import type { TranscriptionSession } from '@tanstack/ai'
import { deepgramLiveTranscription } from '@tanstack/ai-deepgram'
import { mediaPayload } from './twilio'

export async function handleCall(twilio: WebSocket) {
  // Listen before the session opens. Twilio sends audio right away.
  const early: Array<string> = []
  let session: TranscriptionSession | undefined
  let callEnded = false
  twilio.addEventListener('message', (event) => {
    const payload = mediaPayload(event.data)
    if (!payload) return
    if (session) session.send(payload)
    else early.push(payload)
  })
  twilio.addEventListener('close', () => {
    callEnded = true
    void session?.close()
  })

  session = await transcriptionSession({
    adapter: deepgramLiveTranscription('nova-3'),
    audio: { encoding: 'mulaw', sampleRate: 8000 },
    language: 'en',
  })
  for (const payload of early) session.send(payload)
  if (callEnded) await session.close()

  for await (const event of session) {
    if (event.type === 'final') console.log('Caller:', event.text)
  }
}
```

5. Call the number and talk. Each finished phrase prints as you say it.

## Reply to the caller

Collect the `final` text of a turn. When the provider sends `turn-end`, give the turn to `chat()`:

```typescript
import { chat, transcriptionSession } from '@tanstack/ai'
import type { ModelMessage } from '@tanstack/ai'
import { deepgramLiveTranscription } from '@tanstack/ai-deepgram'
import { openaiText } from '@tanstack/ai-openai'

export async function runAgent(callId: string, audio: AsyncIterable<string>) {
  const session = await transcriptionSession({
    adapter: deepgramLiveTranscription('nova-3'),
    audio: { encoding: 'mulaw', sampleRate: 8000 },
  })
  // Close the session when the audio ends, or when the source fails.
  const feeding = (async () => {
    try {
      for await (const chunk of audio) session.send(chunk)
    } finally {
      await session.close()
    }
  })()

  const messages: Array<ModelMessage> = []
  let turn = ''
  for await (const event of session) {
    if (event.type === 'final') turn = `${turn} ${event.text}`.trim()
    if (event.type === 'turn-end' && turn) {
      messages.push({ role: 'user', content: turn })
      turn = ''
      const { text } = await chat({
        adapter: openaiText('gpt-6.1-sol'),
        messages,
        threadId: callId,
        stream: false,
      })
      messages.push({ role: 'assistant', content: text })
      console.log('Agent:', text)
    }
  }
  await feeding
}
```

This example prints the reply. To speak it to the caller, generate audio with `generateSpeech()` and send it back on the Twilio stream.

The session yields four kinds of event:

| Event      | Meaning                                                                       |
| ---------- | ----------------------------------------------------------------------------- |
| `interim`  | Text that can still change. Use it for live captions, and to stop playback when the caller talks over the agent. |
| `final`    | Stable text for one segment. It does not change again.                        |
| `turn-end` | The provider thinks the speaker finished their turn.                          |
| `error`    | A provider or connection error. The session can end after it.                 |

## Pick a provider

Swap the adapter to change provider. The rest of the code stays the same. Cloudflare is the exception: it needs the `env.AI` binding, so it runs inside a Worker.

| Provider   | Adapter                                                 | Phone audio (8 kHz)  |
| ---------- | ------------------------------------------------------- | -------------------- |
| Deepgram   | `deepgramLiveTranscription('nova-3')` from `@tanstack/ai-deepgram` | μ-law, A-law |
| ElevenLabs | `elevenlabsLiveTranscription('scribe_v2_realtime')` from `@tanstack/ai-elevenlabs` | μ-law |
| OpenAI     | `openaiLiveTranscription('gpt-transcribe')` from `@tanstack/ai-openai` | μ-law, A-law |
| xAI        | `grokLiveTranscription('grok-voice-transcribe-2.0')` from `@tanstack/ai-grok` | μ-law, A-law |
| Gemini     | `geminiLiveTranscription('gemini-3.5-transcribe-live')` from `@tanstack/ai-gemini` | Converted to PCM |
| Mistral    | `mistralLiveTranscription('voxtral-mini-transcribe-realtime-2602')` from `@tanstack/ai-mistral` | μ-law, A-law |
| Cloudflare | `cloudflareLiveTranscription('@cf/deepgram/nova-3', { binding: env.AI })` from `@tanstack/ai-cloudflare` | μ-law |

When a provider does not take your audio format, the session converts it to PCM for you. See [Live Transcription: Advanced](./live-transcription-advanced) for audio formats, provider options, and custom adapters.
