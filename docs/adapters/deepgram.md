---
title: Deepgram
id: deepgram-adapter
description: "Stream live speech-to-text from Deepgram Nova-3 and Flux in TanStack AI with @tanstack/ai-deepgram. Takes phone audio (μ-law, A-law) as is."
keywords:
  - tanstack ai
  - deepgram
  - nova-3
  - flux
  - live transcription
  - speech-to-text
  - telephony
  - adapter
---

`deepgramLiveTranscription()` streams speech-to-text from Deepgram for [`transcriptionSession()`](../media/live-transcription). It takes μ-law, A-law, and PCM audio, so phone audio goes in as is. The adapter has no chat.

## 1. Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-deepgram
vue: @tanstack/ai @tanstack/ai-deepgram
solid: @tanstack/ai @tanstack/ai-deepgram
svelte: @tanstack/ai @tanstack/ai-deepgram
preact: @tanstack/ai @tanstack/ai-deepgram
angular: @tanstack/ai @tanstack/ai-deepgram
vanilla: @tanstack/ai @tanstack/ai-deepgram
octane: @tanstack/ai @tanstack/ai-deepgram

<!-- ::end:tabs -->

## 2. Set the API key

Create a key in the [Deepgram console](https://console.deepgram.com/). Put it in the environment of your server:

```bash
DEEPGRAM_API_KEY=your-deepgram-key
```

The adapter reads `DEEPGRAM_API_KEY`. To pass the key in code, use the second argument:

```typescript
import { deepgramLiveTranscription } from '@tanstack/ai-deepgram'

const adapter = deepgramLiveTranscription('nova-3', { apiKey: 'your-deepgram-key' })
```

## 3. Transcribe live audio

```typescript
import { transcriptionSession } from '@tanstack/ai'
import { deepgramLiveTranscription } from '@tanstack/ai-deepgram'

const session = await transcriptionSession({
  adapter: deepgramLiveTranscription('nova-3'),
  audio: { encoding: 'mulaw', sampleRate: 8000 },
  language: 'en',
})

for await (const event of session) {
  if (event.type === 'final') console.log(event.text)
}
```

Call `session.send()` with each audio chunk, and `session.close()` at the end. [Live Transcription](../media/live-transcription) shows a full phone call.

## Models

Pick the model family for the job:

- `nova-3`, `nova-3-general`, `nova-3-medical`, `nova-2`, `nova-2-phonecall`: fast streaming text. A `turn-end` comes when the speaker pauses.
- `flux-general-en`, `flux-general-multi`: built-in turn detection for voice agents. They take audio at 8, 16, 24, 44.1, and 48 kHz.

## Options

Pass options in `modelOptions`:

| Option           | Models | Meaning                                                  |
| ---------------- | ------ | -------------------------------------------------------- |
| `keyterms`       | All    | Terms the model should recognize.                        |
| `endpointing`    | Nova   | Milliseconds of silence that end an utterance, or `false`. |
| `utteranceEndMs` | Nova   | Send a `turn-end` after this many ms with no new words.  |
| `smartFormat`    | Nova   | Format numbers, dates, and so on.                        |
| `eotThreshold`   | Flux   | End-of-turn confidence threshold. Defaults to 0.7.       |
| `eotTimeoutMs`   | Flux   | End the turn after this many ms of silence.              |
| `params`         | All    | Other Deepgram query parameters, passed as is.           |

The adapter connects with the global `WebSocket`. On a runtime without one, pass a constructor as `WebSocket` in the second argument.
