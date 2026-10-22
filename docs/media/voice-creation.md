---
title: Voice Creation
id: voice-creation
order: 3.5
description: "Make a new voice from a text description or a reference clip with generateVoice(), then speak with it through generateSpeech()."
keywords:
  - tanstack ai
  - voice creation
  - voice design
  - voice cloning
  - generateVoice
  - elevenlabs voice design
  - custom voice
---

`generateVoice()` creates a voice id. Pass that id as `voice` to `generateSpeech()`.

## Quick setup

This designs a voice from a description with ElevenLabs, and plays the previews in the browser. It takes about 5 minutes.

1. Install the packages:

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-react @tanstack/ai-elevenlabs

<!-- ::end:tabs -->

2. Put your key in `.env`:

```bash
ELEVENLABS_API_KEY=your-elevenlabs-api-key
```

3. Add a `POST` route at `/api/generate/voice`:

```typescript
import {
  generateVoice,
  generationParamsFromRequest,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { elevenlabsVoiceDesign } from '@tanstack/ai-elevenlabs'

export async function POST(request: Request) {
  const { input, threadId } = await generationParamsFromRequest('voice', request)
  if (typeof input.prompt !== 'string') {
    return new Response('Describe the voice in `prompt`.', { status: 400 })
  }

  const stream = generateVoice({
    adapter: elevenlabsVoiceDesign('eleven_ttv_v3'),
    prompt: input.prompt,
    threadId,
    stream: true,
  })
  return toServerSentEventsResponse(stream)
}
```

4. Call the route from a component. There is no voice-specific hook, so use the generic `useGeneration` hook:

```tsx
import { fetchServerSentEvents, useGeneration } from '@tanstack/ai-react'
import type { VoiceResult } from '@tanstack/ai'

export function VoiceDesigner() {
  const { generate, result, isLoading, error } = useGeneration<
    { prompt: string },
    VoiceResult
  >({
    connection: fetchServerSentEvents('/api/generate/voice'),
    threadId: 'generation',
  })

  return (
    <div>
      <button
        onClick={() =>
          generate({
            prompt: 'A warm, gravelly narrator in his sixties with a slight Irish lilt',
          })
        }
        disabled={isLoading}
      >
        {isLoading ? 'Designing...' : 'Design a voice'}
      </button>
      {error && <p role="alert">Error: {error.message}</p>}
      {result?.voices.map((voice) => (
        <div key={voice.voiceId}>
          <p>Voice id: {voice.voiceId}</p>
          {voice.audio && (
            <audio
              src={`data:${voice.contentType ?? 'audio/mpeg'};base64,${voice.audio}`}
              controls
            />
          )}
        </div>
      ))}
    </div>
  )
}
```

Click **Design a voice**. You get a few candidate voices. Each one has a preview to play and a voice id.

## How it works

You can make a voice in two ways:

- **Design**: you describe the voice in words. The provider makes it up.
- **Clone**: you give a clip of a real speaker. The provider makes a voice from it.

Both ways return a list of voices. Each voice has a `voiceId`, and usually a short preview in `audio` (base64). To speak with a voice, pass its `voiceId` to `generateSpeech()` as `voice`.

A longer, more specific description gives a better voice. Name the age, the accent, the pace, and the mood.

To call the route from a TanStack Start server function instead, see [Transports in full](./generations#transports-in-full). The `useGeneration` options are in [Generation Hooks](./generation-hooks#options).

## Speak with the new voice

Put the voice id into `generateSpeech()`:

```typescript
import { generateSpeech, generateVoice } from '@tanstack/ai'
import { elevenlabsSpeech, elevenlabsVoiceDesign } from '@tanstack/ai-elevenlabs'

const designed = await generateVoice({
  adapter: elevenlabsVoiceDesign('eleven_ttv_v3'),
  prompt: 'A warm, gravelly narrator in his sixties',
  threadId: 'thread-1',
})

const [best] = designed.voices
if (!best) throw new Error('The provider returned no voices.')

const speech = await generateSpeech({
  adapter: elevenlabsSpeech('eleven_v4'),
  text: 'Once upon a time, in a village at the edge of the sea...',
  threadId: 'thread-1',
  voice: best.voiceId,
})

console.log(speech.contentType) // 'audio/mpeg'
```

## Keep a voice for later

A designed voice is a preview by default, and previews expire. To keep the voice in the library of the provider, pass a `name`:

```typescript
import { generateVoice } from '@tanstack/ai'
import { elevenlabsVoiceDesign } from '@tanstack/ai-elevenlabs'

const result = await generateVoice({
  adapter: elevenlabsVoiceDesign('eleven_ttv_v3'),
  prompt: 'A bright, upbeat product demo host',
  threadId: 'thread-1',
  name: 'Demo Host',
  description: 'Bright, upbeat, mid-30s',
})

const [saved] = result.voices
if (!saved) throw new Error('The provider returned no voices.')

console.log(saved.saved) // true
console.log(saved.voiceId) // A permanent voice id. Store it.
```

Store `voiceId` in your database. Then every later `generateSpeech()` call uses it, and you do not design the same voice again.

Providers do not all treat `name` the same way. ElevenLabs keeps a voice only when you give a name. To see what happened, read `saved` on each returned voice.

## Guide a design with a reference clip

Some models take a clip of a real speaker as a reference. Pass the clip as `referenceAudio`.

On ElevenLabs, the clip guides the design. It is not a direct copy:

- `eleven_ttv_v3` still needs a `prompt`.
- `modelOptions.promptStrength` sets how much of the voice comes from the description, and how much from the clip.
- `promptStrength: 0` gives a voice that comes almost fully from the clip.

```typescript
import { readFile } from 'node:fs/promises'
import { generateVoice } from '@tanstack/ai'
import { elevenlabsVoiceDesign } from '@tanstack/ai-elevenlabs'

const clip = await readFile('./narrator.mp3')

const result = await generateVoice({
  adapter: elevenlabsVoiceDesign('eleven_ttv_v3'),
  prompt: 'The same speaker, but younger and more energetic',
  threadId: 'thread-1',
  // Use `new Blob([clip])`, not `clip.buffer`. A Buffer can be a view into a
  // shared pool, so its `.buffer` can hold more than the bytes of the file.
  referenceAudio: new Blob([clip]),
  name: 'Young Narrator',
})
```

`referenceAudio` accepts a base64 string, a base64 data URL, a `Blob`, a `File`, or an `ArrayBuffer`. A remote URL is refused. Read the file yourself and pass the bytes.

> [!WARNING]
> Clone a voice only if the speaker agrees. Most providers make this a condition of their terms.

Your app can now make its own voices and speak with them.

## Advanced

### Find a voice you made earlier

If you store the `voiceId`, you do not need this. If you lose it, `listVoices()` reads the voice list of the account:

```typescript
import { listVoices } from '@tanstack/ai'
import { elevenlabsSpeech } from '@tanstack/ai-elevenlabs'

const { voices } = await listVoices({
  adapter: elevenlabsSpeech('eleven_v4'),
  origins: ['generated', 'cloned'],
})

for (const voice of voices) {
  console.log(voice.voiceId, voice.name)
}
```

Each voice has `voiceId`. It also has `name`, `origin`, `description`, `previewUrl`, and `labels` when the provider reports them. `origin` is one of:

- `premade`: the stock voices of the provider.
- `generated`: designed from a description.
- `cloned`: made from reference audio.
- `professional`: a curated or paid tier.

Leave out `origins` to get all voices, including the stock voices.

Only providers with a voice list per account support `listVoices()`. On providers with a fixed list, the package exports that list, so you do not need a network call:

- `GeminiTTSVoices` from `@tanstack/ai-gemini`.
- The `OpenAITTSVoice` type from `@tanstack/ai-openai`.

On those adapters, `listVoices()` throws, and the message names these exports.

### Provider support

| Provider | Design | Reference audio | Adapter |
| --- | --- | --- | --- |
| ElevenLabs | Yes | Yes, on `eleven_ttv_v3` | `elevenlabsVoiceDesign()` |

ElevenLabs is the only provider with a `generateVoice()` adapter. Its voice models are `eleven_ttv_v3` and `eleven_multilingual_ttv_v2`. Only `eleven_ttv_v3` takes reference audio.

OpenAI, Gemini, and Cloudflare have a fixed voice list. They have no `generateVoice()` adapter, and they will not get one.

xAI, BytePlus, and fal.ai each have a voice cloning API. No adapter for them exists yet.

### Options

| Option | Type | Description |
| --- | --- | --- |
| `adapter` | `VoiceAdapter` | The voice adapter, made with a model |
| `prompt` | `string` | A text description of the voice |
| `referenceAudio` | `string \| File \| Blob \| ArrayBuffer` | A clip of the speaker to clone |
| `name` | `string` | The name to store the voice under |
| `description` | `string` | A description stored with the voice |
| `modelOptions` | `object` | Options for this provider, typed per adapter |
| `stream` | `boolean` | Return a stream of events for an SSE route |

Give `prompt`, or `referenceAudio`, or both. ElevenLabs always needs `prompt`, because its design endpoint requires a description.

### Result shape

`generateVoice()` returns a `VoiceResult` with `id`, `model`, and `voices`. It can also have `previewText` and `usage`.

Each voice in `voices` has:

- `voiceId`: pass it to `generateSpeech()` as `voice`.
- `saved`: `true` if the provider keeps the voice.
- `status`: `'ready'` on every adapter, because each adapter finishes the voice before it returns.
- `audio`, `format`, `contentType`, `duration`, and `language`, when the provider reports them.

Model ids and provider options are in the [ElevenLabs adapter](../adapters/elevenlabs) page.
