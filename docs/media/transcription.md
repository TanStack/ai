---
title: Transcription
id: transcription
order: 4
description: "Turn recorded speech into text with generateTranscription() and the useTranscription hook. Works with OpenAI, ElevenLabs, Cartesia, Groq, xAI, BytePlus, fal.ai, Cloudflare, and Lovable."
keywords:
  - tanstack ai
  - transcription
  - speech-to-text
  - asr
  - whisper
  - generateTranscription
  - openai
  - groq
  - fal
---

Transcription sends audio to a speech-to-text model and returns the text, with timestamps when you request them.

## Transcribe your first file

You need a React app with a server route, and an OpenAI API key. This takes about 5 minutes.

1. Install the packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-openai

<!-- ::end:tabs -->

2. Put your key in `.env`:

```bash
OPENAI_API_KEY=sk-...
```

3. Add a `POST` route at `/api/transcribe`:

```typescript
import {
  generateTranscription,
  generationParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { openaiTranscription } from '@tanstack/ai-openai'

export async function POST(request: Request) {
  const { input, threadId } = await generationParamsFromRequest('transcription', request)
  if (typeof input.audio !== 'string') {
    return new Response('Send the audio as a data URL.', { status: 400 })
  }

  const abortController = new AbortController()
  const stream = generateTranscription({
    adapter: openaiTranscription('gpt-transcribe'),
    audio: input.audio,
    language: input.language,
    abortSignal: abortController.signal,
    stream: true,
    threadId,
  })
  return toServerSentEventsResponse(stream, { abortController })
}
```

An adapter with `transcribeStream` sends text deltas as they arrive. An adapter without it sends the completed text in one delta. If you pass `middleware`, the route sends one delta after the middleware completes.

4. Add a component that reads a file and sends it:

```tsx
import type { ChangeEvent } from 'react'
import { useState } from 'react'
import { fetchServerSentEvents, useTranscription } from '@tanstack/ai-react'

export function Transcriber() {
  const [transcript, setTranscript] = useState('')
  const [isReading, setIsReading] = useState(false)
  const [fileError, setFileError] = useState('')
  const { generate, result, isLoading, error, reset } = useTranscription({
    connection: fetchServerSentEvents('/api/transcribe'),
    threadId: 'transcription',
    onChunk(chunk) {
      if (chunk.type === 'TEXT_MESSAGE_START') {
        setTranscript('')
      } else if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
        setTranscript((current) => current + chunk.delta)
      }
    },
  })
  const displayedTranscript =
    isReading || isLoading || error || fileError
      ? transcript
      : (result?.text ?? transcript)

  function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    reset()
    setTranscript('')
    setFileError('')
    setIsReading(true)
    const reader = new FileReader()
    reader.onload = () => {
      const audio = reader.result
      if (typeof audio !== 'string') {
        setFileError('Audio file read failed.')
        setIsReading(false)
        return
      }
      void generate({ audio, language: 'en' })
      setIsReading(false)
    }
    reader.onerror = () => {
      setFileError(
        reader.error?.message || 'Audio file read failed.',
      )
      setIsReading(false)
    }
    reader.onabort = () => {
      setFileError('The browser stopped reading the audio file.')
      setIsReading(false)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div>
      <input
        type="file"
        accept="audio/*"
        onChange={handleFile}
        disabled={isReading || isLoading}
      />
      {isReading && <p>Reading audio file...</p>}
      {isLoading && <p>Transcribing...</p>}
      {fileError && <p role="alert">{fileError}</p>}
      {error && <p role="alert">Error: {error.message}</p>}
      {displayedTranscript && <p>{displayedTranscript}</p>}
    </div>
  )
}
```

Pick an audio file. The text of the recording shows up below the input.

To record from the microphone instead of a file, see [Audio Recording](./audio-recording).

## How it works

- **The component** reads the file as a data URL. The hook sends its input as JSON, so the audio must be a string. A data URL also tells the provider the real audio type.
- **The route** reads the input with `generationParamsFromRequest()`. Then `generateTranscription()` sends the audio to the model.
- **The hook** gets the result back over Server-Sent Events. With `gpt-transcribe`, `gpt-4o-transcribe`, and `gpt-4o-mini-transcribe`, `onChunk` receives standard AG-UI text events as the transcription arrives. `result.text` holds the completed result.
- When the format is `json`, or when you omit the format, `gpt-transcribe`, `gpt-4o-transcribe`, and `gpt-4o-mini-transcribe` send each text delta. When the format is not `json`, those models wait for the full result and send one text delta.
- `gpt-4o-transcribe` and `gpt-4o-mini-transcribe` accept `json` and `text`. The format `verbose_json` returns an API error.
- When the request finishes, Whisper and an adapter without `transcribeStream` send the completed text in one delta.

The result can also hold:

- `language`: the language that the model detected or that you set.
- `duration`: the length of the audio, in seconds.
- `segments`: parts of the text with `start` and `end` times. Some providers add a `speaker` label.
- `words`: word-level timestamps, when the provider returns them.

The other transports (a server function that returns JSON, or one that returns a stream) are in [Generations](./generations#transports-in-full). Every `useTranscription` input field is in [Generation Hooks](./generation-hooks#usetranscription), and the hook options are in [Options](./generation-hooks#options).

To keep the status and the result of a long file after a page reload, add [Generation Persistence](../persistence/generation-persistence).

## Transcribe on the server only

You do not need a hook to transcribe a file you already have on the server. Call `generateTranscription()` without `stream` and read the result:

```typescript
import { readFile } from 'node:fs/promises'
import { generateTranscription } from '@tanstack/ai'
import { openaiTranscription } from '@tanstack/ai-openai'

const bytes = await readFile('./meeting-recording.mp3')
const audio = new File([bytes], 'meeting-recording.mp3', { type: 'audio/mpeg' })

const result = await generateTranscription({
  adapter: openaiTranscription('gpt-4o-transcribe'),
  audio,
  language: 'en',
  threadId: 'thread-1',
})

console.log(result.text)
```

`audio` accepts any of these:

- A `File` or a `Blob`.
- An `ArrayBuffer`.
- A base64 string. The OpenAI, Groq, and Cartesia adapters treat plain base64 as `audio/mpeg`.
- A data URL, such as `data:audio/webm;base64,...`. The type in the URL goes to the provider.

## Providers

Swap the adapter to change the provider. Each adapter reads its key from the environment.

| Provider | Adapter | Models | Key |
| --- | --- | --- | --- |
| OpenAI | `openaiTranscription` | `gpt-transcribe`, `gpt-4o-transcribe`, `gpt-4o-mini-transcribe`, `gpt-4o-transcribe-diarize`, `whisper-1` | `OPENAI_API_KEY` |
| ElevenLabs | `elevenlabsTranscription` | `scribe_v2`, `scribe_v2_medical` | `ELEVENLABS_API_KEY` |
| Cartesia | `cartesiaTranscription` | `ink-whisper` | `CARTESIA_API_KEY` |
| Groq | `groqTranscription` | `whisper-large-v3-turbo`, `whisper-large-v3` | `GROQ_API_KEY` |
| xAI | `grokTranscription` | `grok-stt` | `XAI_API_KEY` |
| BytePlus | `byteplusTranscription` | `seed-asr` | `BYTEPLUS_VOICE_API_KEY` |
| fal.ai | `falTranscription` | `fal-ai/whisper`, Wizper, and other fal speech-to-text endpoints | `FAL_KEY` |
| Cloudflare | `cloudflareTranscription` | `@cf/openai/whisper-large-v3-turbo`, `@cf/deepgram/nova-3` | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` |
| Lovable | `lovableTranscription` | `openai/gpt-4o-transcribe`, `openai/gpt-4o-mini-transcribe` | `LOVABLE_API_KEY` |

Need speaker labels? Use `gpt-4o-transcribe-diarize`, or BytePlus with `enable_speaker_info`. Examples for each provider are in [Transcription: Advanced](./transcription-advanced).

If you omit `language` for Cartesia, the request uses English and translates other speech into English. When the recording is not English, pass `language`.

## Common options

| Option | Type | Description |
| --- | --- | --- |
| `audio` | `string \| File \| Blob \| ArrayBuffer` | The audio to transcribe (required) |
| `language` | `string` | The language in ISO-639-1 format, for example `"en"`, `"es"`, or `"ja"`. A correct language makes the result more accurate and faster. |
| `prompt` | `string` | Words or names the model must expect, for example `"Technical terms: API, SDK, CLI"`. `gpt-4o-transcribe-diarize` and Cartesia do not support `prompt`. |
| `responseFormat` | `'json' \| 'text' \| 'srt' \| 'verbose_json' \| 'vtt'` | The output format. `verbose_json` adds timestamps and segments. Cartesia accepts only `json` and `verbose_json`. For Cartesia, `verbose_json` returns word timestamps and does not return segments. |
| `modelOptions` | `object` | Provider options. They are typed for the model you pass. |
| `debug` | `DebugOption` | Log the request and every raw provider chunk. See [Debug Logging](../advanced/debug-logging). |

## Advanced

Provider examples, OpenAI model options, speaker diarization, the result type, audio formats, errors, and explicit API keys are in [Transcription: Advanced](./transcription-advanced).
