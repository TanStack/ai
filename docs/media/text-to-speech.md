---
title: Text-to-Speech
id: text-to-speech
order: 3
description: "Turn text into spoken audio with generateSpeech() and play it in the browser. Works with OpenAI, Gemini, ElevenLabs, BytePlus, fal.ai, Grok, and Groq."
keywords:
  - tanstack ai
  - text-to-speech
  - tts
  - generateSpeech
  - openai tts
  - voice synthesis
  - speech generation
---

You want your app to read text out loud: a reply, an article, or a notification. `generateSpeech()` sends the text to a text-to-speech (TTS) model and gives you back audio that the browser can play.

## Quick setup

This reads a sentence out loud with OpenAI. It takes about 5 minutes.

1. Install the packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-openai

<!-- ::end:tabs -->

2. Put your key in `.env`:

```bash
OPENAI_API_KEY=sk-...
```

3. Add a `POST` route at `/api/generate/speech`:

```typescript
import {
  generateSpeech,
  generationParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiSpeech } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const { input } = await generationParamsFromRequest('tts', request)

  const stream = generateSpeech({
    adapter: openaiSpeech('tts-1-hd'),
    text: input.text,
    voice: input.voice ?? 'alloy',
    stream: true,
  })
  return toServerSentEventsResponse(stream)
}
```

4. Call the route from a component and play the result:

```tsx
import { fetchServerSentEvents, useGenerateSpeech } from '@tanstack/ai-react'

export function SpeechPlayer() {
  const { generate, result, isLoading, error } = useGenerateSpeech({
    connection: fetchServerSentEvents('/api/generate/speech'),
  })

  return (
    <div>
      <button
        onClick={() => generate({ text: 'Hello, welcome to TanStack AI!' })}
        disabled={isLoading}
      >
        {isLoading ? 'Generating...' : 'Speak'}
      </button>
      {error && <p role="alert">Error: {error.message}</p>}
      {result && (
        <audio
          src={`data:${result.contentType ?? 'audio/mpeg'};base64,${result.audio}`}
          controls
          autoPlay
        />
      )}
    </div>
  )
}
```

Click **Speak**. The audio player shows up and plays the sentence.

## How it works

- **The server.** `generateSpeech()` sends `text` and `voice` to the provider. The result holds the audio as a base64 string, plus its `format` and `contentType`.
- **The stream.** With `stream: true`, the route sends the result to the browser as Server-Sent Events.
- **The hook.** `useGenerateSpeech()` stores the result on `result`. A `data:` URL turns the base64 audio into something an `<audio>` element can play.

The hook takes the same input fields as `generateSpeech()`. They are listed in [Generation Hooks](./generation-hooks#usegeneratespeech). To use a server function instead of an API route, see [Transports in full](./generations#transports-in-full).

Each provider has a fixed set of voices. If none of them fit, [create your own voice](./voice-creation) and pass its id as `voice`.

## Pick a provider

Swap the adapter to change the provider. The rest of the route stays the same.

| Provider | Adapter | Models | API key |
| --- | --- | --- | --- |
| OpenAI | `openaiSpeech` from `@tanstack/ai-openai` | `tts-1-hd`, `tts-1`, `gpt-4o-audio-preview` | `OPENAI_API_KEY` |
| Gemini (experimental) | `geminiSpeech` from `@tanstack/ai-gemini` | `gemini-3.1-flash-tts-preview`, `gemini-2.5-flash-preview-tts`, `gemini-2.5-pro-preview-tts` | `GOOGLE_API_KEY` or `GEMINI_API_KEY` |
| ElevenLabs | `elevenlabsSpeech` from `@tanstack/ai-elevenlabs` | `eleven_v4`, `eleven_v4_turbo`, `eleven_v3`, and more | `ELEVENLABS_API_KEY` |
| BytePlus | `byteplusSpeech` from `@tanstack/ai-byteplus` | `seed-audio-1.0` | `BYTEPLUS_VOICE_API_KEY` |
| fal.ai | `falSpeech` from `@tanstack/ai-fal` | Kokoro, ElevenLabs, MiniMax, Gemini TTS, Chatterbox, and more | `FAL_KEY` |
| Grok | `grokSpeech` from `@tanstack/ai-grok` | `grok-tts` | `XAI_API_KEY` |
| Groq | `groqSpeech` from `@tanstack/ai-groq` | `canopylabs/orpheus-v1-english`, `canopylabs/orpheus-arabic-saudi` | `GROQ_API_KEY` |

For example, to use ElevenLabs:

```typescript
import { generateSpeech } from '@tanstack/ai'
import { elevenlabsSpeech } from '@tanstack/ai-elevenlabs'

const result = await generateSpeech({
  adapter: elevenlabsSpeech('eleven_v4'),
  text: 'Welcome to TanStack AI.',
})
```

More provider samples are in [Provider examples](#provider-examples).

## Dialogue with two or more voices

You want a short scene with two speakers. One `text` with one `voice` cannot do that. Pass `turns` instead. Each turn has its own text and its own voice:

```typescript
import { generateSpeech } from '@tanstack/ai'
import { byteplusSpeech } from '@tanstack/ai-byteplus'

// Replace SECOND_VOICE with another voice id from the BytePlus voice list.
const SECOND_VOICE = 'your-second-voice-id'

const result = await generateSpeech({
  adapter: byteplusSpeech('seed-audio-1.0'),
  turns: [
    {
      text: 'Do you have a left-handed bass?',
      voice: 'en_female_stokie_uranus_bigtts',
    },
    { text: 'We do. Come and try it.', voice: SECOND_VOICE },
  ],
  format: 'mp3',
})
```

Send `turns` or `text`, not both.

Each adapter declares how many voices it accepts in one request. A request with too many voices fails before it reaches the provider:

| Adapter | Different voices per request |
| --- | --- |
| `byteplusSpeech` | 3 |
| `elevenlabsSpeech` | 10 |
| `geminiSpeech` | 2 |
| Other TTS adapters | No dialogue |

Read the limits at runtime from `adapter.capabilities`:

```typescript
import { byteplusSpeech } from '@tanstack/ai-byteplus'

const adapter = byteplusSpeech('seed-audio-1.0')

console.log(adapter.capabilities?.maxSpeakers) // 3
console.log(adapter.capabilities?.timestamps) // true
```

## Timings for each word and turn

`result.duration` is the length of the file. It does not tell you where the speech stops, or where each turn starts. You need that to trim silence at the end or to show captions.

Set `timestamps: true` to get the timings:

```typescript
import { generateSpeech } from '@tanstack/ai'
import { byteplusSpeech } from '@tanstack/ai-byteplus'

const result = await generateSpeech({
  adapter: byteplusSpeech('seed-audio-1.0'),
  text: 'Welcome to the guitar store.',
  timestamps: true,
})

// Where the speech ends. This is earlier than the end of the file.
const speechEnds = result.alignment?.endSeconds.at(-1)

for (const segment of result.segments ?? []) {
  console.log(segment.startSeconds, segment.endSeconds, segment.text)
}
```

The result has two fields with timings:

- `alignment`: one entry per character or per word, with start and end times. `alignment.unit` tells you which one the provider sent.
- `segments`: one entry per turn (dialogue) or per sentence (one voice). A dialogue segment also has `turnIndex` and `voice`.

All times are in seconds. If a provider sends milliseconds, the adapter converts them.

An adapter that cannot return timings rejects `timestamps`. It does not send back an empty result. Read `adapter.capabilities?.timestamps` before you ask.

Your app now speaks text with the voice and the provider you picked.

## Advanced

### Provider examples

#### Gemini (experimental)

```typescript
import { generateSpeech } from '@tanstack/ai'
import { geminiSpeech } from '@tanstack/ai-gemini'

const result = await generateSpeech({
  adapter: geminiSpeech('gemini-3.1-flash-tts-preview'),
  text: 'Hello from Gemini TTS!',
})
```

#### fal.ai

fal.ai has many TTS models. Pass the model id as a string literal to get typed `modelOptions`.

```typescript
import { generateSpeech } from '@tanstack/ai'
import { falSpeech } from '@tanstack/ai-fal'

// Gemini 3.1 Flash TTS: 80+ languages and expressive audio tags
const result = await generateSpeech({
  adapter: falSpeech('fal-ai/gemini-3.1-flash-tts'),
  text: '[warm, enthusiastic] Welcome to TanStack AI!',
  voice: 'Kore',
})
```

```typescript
import { generateSpeech } from '@tanstack/ai'
import { falSpeech } from '@tanstack/ai-fal'

// Kokoro, American English
const result = await generateSpeech({
  adapter: falSpeech('fal-ai/kokoro/american-english'),
  text: 'Hello from fal!',
  voice: 'af_heart',
  speed: 1.0,
})

console.log(result.format) // for example "wav"
```

The fal adapter puts the top-level `voice` and `speed` into the model input. Use `modelOptions` only for keys of that one model:

```typescript
import { generateSpeech } from '@tanstack/ai'
import { falSpeech } from '@tanstack/ai-fal'

const result = await generateSpeech({
  adapter: falSpeech('fal-ai/elevenlabs/tts/eleven-v3'),
  text: 'Welcome to TanStack AI.',
  voice: 'Rachel',
  modelOptions: {
    stability: 0.5,
  },
})
```

#### BytePlus Seed Speech

Seed Speech is a different BytePlus product from ModelArk. It uses its own key, `BYTEPLUS_VOICE_API_KEY`. The `ARK_API_KEY` of the chat, image, and video adapters does not work here.

```typescript
import { generateSpeech } from '@tanstack/ai'
import { byteplusSpeech } from '@tanstack/ai-byteplus'

const result = await generateSpeech({
  adapter: byteplusSpeech('seed-audio-1.0'),
  text: 'Welcome to TanStack AI!',
  voice: 'en_female_stokie_uranus_bigtts',
  format: 'mp3',
})

console.log(result.contentType) // "audio/mpeg"
```

Seed Speech limits:

- The formats are `wav`, `mp3`, `pcm`, and `ogg_opus`.
- One call makes at most 120 seconds of audio.

Seed Speech has no top-level `speaker` field. The adapter sends `voice` as `references: [{ speaker }]`. If you set `modelOptions.references` for voice cloning, it replaces that array, and `voice` is lost. To keep a stock voice, add a `speaker` member yourself. The voice id names are in the [BytePlus adapter](../adapters/byteplus-advanced#voice-ids) page.

### OpenAI voices, formats, and options

OpenAI voices:

| Voice | Sound |
| --- | --- |
| `alloy` | Neutral and balanced. The default. |
| `echo` | Warm and conversational |
| `fable` | Expressive, good for stories |
| `onyx` | Deep and authoritative |
| `nova` | Friendly and upbeat |
| `shimmer` | Clear and gentle |
| `ash` | Calm and measured |
| `ballad` | Melodic and flowing |
| `coral` | Bright and energetic |
| `sage` | Wise and thoughtful |
| `verse` | Poetic and rhythmic |

OpenAI formats:

| Format | Use |
| --- | --- |
| `mp3` | General use. The default. |
| `opus` | Streaming |
| `aac` | AAC audio |
| `flac` | Lossless audio |
| `wav` | Uncompressed audio, for more processing |
| `pcm` | Raw PCM audio |

OpenAI models:

| Model | Quality | Speed | Use it for |
| --- | --- | --- | --- |
| `tts-1` | Standard | Fast | Realtime apps |
| `tts-1-hd` | High | Slower | Production audio |
| `gpt-4o-audio-preview` | Highest | Changes | Voice style control |

`voice`, `format`, and `speed` are top-level options of `generateSpeech()`. They are not `modelOptions` keys. `speed` goes from 0.25 to 4.0.

`modelOptions.instructions` sets the speaking style. Only `gpt-4o-audio-preview` accepts it. On `tts-1` and `tts-1-hd`, the call throws.

```typescript
import { generateSpeech } from '@tanstack/ai'
import { openaiSpeech } from '@tanstack/ai-openai'

const result = await generateSpeech({
  adapter: openaiSpeech('gpt-4o-audio-preview'),
  text: 'High quality speech synthesis',
  voice: 'nova',
  format: 'mp3',
  speed: 1.0,
  modelOptions: {
    instructions: 'Speak in a calm, measured tone',
  },
})
```

OpenAI accepts at most 4096 characters of text in one request. For longer text, split it into parts.

The fixed voice lists are also exported as types: `OpenAITTSVoice` from `@tanstack/ai-openai`, and `GeminiTTSVoices` from `@tanstack/ai-gemini`.

### Result shape

```typescript
import type { PersistedArtifactRef, TokenUsage, TTSAlignment, TTSSegment } from '@tanstack/ai'

interface TTSResult {
  id: string // id of this generation
  model: string // the model that made the audio
  audio: string // base64-encoded audio
  format: string // audio format, for example "mp3"
  duration?: number // length in seconds, if the provider reports it
  alignment?: TTSAlignment // with timestamps: true
  segments?: Array<TTSSegment> // with timestamps: true
  contentType?: string // MIME type, for example "audio/mpeg"
  usage?: TokenUsage // token usage, if the adapter reports it
  artifacts?: Array<PersistedArtifactRef> // stored files, with persistence
}
```

### Play audio without a data URL

A long clip makes a long `data:` URL. A `Blob` URL is lighter. Convert the base64 audio to bytes, then play it:

```typescript
import type { TTSResult } from '@tanstack/ai'

function playAudio(result: TTSResult) {
  const audioData = atob(result.audio)
  const bytes = new Uint8Array(audioData.length)
  for (let i = 0; i < audioData.length; i++) {
    bytes[i] = audioData.charCodeAt(i)
  }

  const blob = new Blob([bytes], { type: result.contentType })
  const url = URL.createObjectURL(blob)

  const audio = new Audio(url)
  void audio.play()
  audio.onended = () => URL.revokeObjectURL(url)
}
```

To do this once per result, put the conversion in `onResult`. See [Result transforms](./generation-hooks#result-transforms).

### Save audio to a file (Node.js)

```typescript
import { writeFile } from 'node:fs/promises'
import { generateSpeech } from '@tanstack/ai'
import { openaiSpeech } from '@tanstack/ai-openai'

const result = await generateSpeech({
  adapter: openaiSpeech('tts-1-hd'),
  text: 'Hello world!',
})

await writeFile('output.mp3', Buffer.from(result.audio, 'base64'))
```

### Errors

The OpenAI adapter checks the input before it calls the API:

```typescript
import { generateSpeech } from '@tanstack/ai'
import { openaiSpeech } from '@tanstack/ai-openai'

try {
  await generateSpeech({
    adapter: openaiSpeech('tts-1-hd'),
    text: 'Hello!',
  })
} catch (error) {
  if (error instanceof Error) {
    if (error.message.includes('exceeds maximum length')) {
      console.error('Text is too long (max 4096 characters)')
    } else if (error.message.includes('Speed must be between')) {
      console.error('Invalid speed value')
    } else {
      console.error('TTS error:', error.message)
    }
  }
}
```

If a request fails or the audio sounds wrong, pass `debug: true` to `generateSpeech()`. It logs the request, every raw chunk from the provider, and any error. See [Debug Logging](../advanced/debug-logging).

### Explicit API keys

Each adapter reads its key from the environment. To pass the key yourself, use the `create*` factory:

```typescript
import { createOpenaiSpeech } from '@tanstack/ai-openai'
import { createGeminiSpeech } from '@tanstack/ai-gemini'

const openaiAdapter = createOpenaiSpeech('tts-1-hd', 'your-openai-api-key')

const geminiAdapter = createGeminiSpeech(
  'gemini-3.1-flash-tts-preview',
  'your-google-api-key',
)
```

### Tips

- **Cache the audio.** Store each result, so that you do not generate the same text again.
- **Pick a voice for the content.** For example, `onyx` fits authoritative content, and `nova` fits friendly messages.
- **Pick a format for the use.** `mp3` is for general use, `opus` is for streaming, and `wav` is for more processing.
