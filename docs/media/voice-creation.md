---
title: Voice Creation
id: voice-creation
order: 3.5
description: "Create a custom voice from a text description or a reference clip with TanStack AI's generateVoice() API, then speak with it through generateSpeech()."
keywords:
  - tanstack ai
  - voice creation
  - voice design
  - voice cloning
  - generateVoice
  - elevenlabs voice design
  - custom voice
---

# Voice Creation

Every text-to-speech provider ships a fixed catalog of voices. Your narrator, your character, or your brand can be absent from that catalog. `generateVoice()` makes a new voice instead of picking one.

There are two ways to create a voice:

- **Design**: you describe the voice in words. The provider invents it.
- **Clone**: you supply a clip of a real speaker, and the provider derives a
  voice from it.

Both give you a voice ID. Pass that ID to [`generateSpeech()`](./text-to-speech) as the `voice` option.

## Design a voice from a description

Describe the voice you want. The provider returns candidate voices, each with a short preview you can listen to.

```typescript
import { generateVoice } from '@tanstack/ai'
import { elevenlabsVoiceDesign } from '@tanstack/ai-elevenlabs'

const result = await generateVoice({
  adapter: elevenlabsVoiceDesign('eleven_ttv_v3'),
  prompt: 'A warm, gravelly narrator in his sixties with a slight Irish lilt',
})

for (const voice of result.voices) {
  console.log(voice.voiceId) // Pass this to generateSpeech()
  console.log(voice.audio) // Base64 preview audio
}
```

A longer, more specific description gives a better result. Name the age, the accent, the pace, and the mood.

## Speak with the new voice

The voice ID goes straight into `generateSpeech()`.

```typescript
import { generateSpeech, generateVoice } from '@tanstack/ai'
import { elevenlabsSpeech, elevenlabsVoiceDesign } from '@tanstack/ai-elevenlabs'

const designed = await generateVoice({
  adapter: elevenlabsVoiceDesign('eleven_ttv_v3'),
  prompt: 'A warm, gravelly narrator in his sixties',
})

const [best] = designed.voices
if (!best) throw new Error('The provider returned no voices.')

const speech = await generateSpeech({
  adapter: elevenlabsSpeech('eleven_v3'),
  text: 'Once upon a time, in a village at the edge of the sea...',
  voice: best.voiceId,
})

console.log(speech.contentType) // 'audio/mpeg'
```

## Keep a voice for later

A designed voice is a preview by default. Previews expire. To keep a voice in the provider's library, pass a `name`.

```typescript
import { generateVoice } from '@tanstack/ai'
import { elevenlabsVoiceDesign } from '@tanstack/ai-elevenlabs'

const result = await generateVoice({
  adapter: elevenlabsVoiceDesign('eleven_ttv_v3'),
  prompt: 'A bright, upbeat product demo host',
  name: 'Demo Host',
  description: 'Bright, upbeat, mid-30s',
})

const [saved] = result.voices
if (!saved) throw new Error('The provider returned no voices.')

console.log(saved.saved) // true
console.log(saved.voiceId) // A permanent voice ID. Store it.
```

Store `voiceId` in your database. Every later `generateSpeech()` call reuses it, and you never design the same voice twice.

Providers differ on what `name` means. ElevenLabs keeps a voice only when you give a name. Read `saved` on each returned voice to see what happened.

## Guide a design with reference audio

Some models take a clip of a real speaker as a reference. Pass the audio as
`referenceAudio`.

ElevenLabs is a design-with-reference, not a straight copy: `eleven_ttv_v3`
still needs a `prompt`, and `modelOptions.promptStrength` sets how much of the
result comes from the description rather than the clip. Pass `0` for a result
that leans almost entirely on the reference.

```typescript
import { readFile } from 'node:fs/promises'
import { generateVoice } from '@tanstack/ai'
import { elevenlabsVoiceDesign } from '@tanstack/ai-elevenlabs'

const clip = await readFile('./narrator.mp3')

const result = await generateVoice({
  adapter: elevenlabsVoiceDesign('eleven_ttv_v3'),
  prompt: 'The same speaker, but younger and more energetic',
  // `new Blob([clip])`, not `clip.buffer`: a Buffer can be a view into a
  // shared pool, so its `.buffer` is not necessarily just the file's bytes.
  referenceAudio: new Blob([clip]),
  name: 'Young Narrator',
})
```

`referenceAudio` accepts a base64 string, a base64 data URL, a `Blob`, a `File`, or an `ArrayBuffer`. A remote URL is refused: read the file yourself and pass the bytes.

CAUTION: Clone a voice only with the consent of the speaker. Most providers make this a condition of their terms.

## Find a voice you made earlier

Store the `voiceId` and you never need this. If you lose it, `listVoices()` reads the account's catalog back.

```typescript
import { listVoices } from '@tanstack/ai'
import { elevenlabsSpeech } from '@tanstack/ai-elevenlabs'

const { voices } = await listVoices({
  adapter: elevenlabsSpeech('eleven_v3'),
  origins: ['generated', 'cloned'],
})

for (const voice of voices) {
  console.log(voice.voiceId, voice.name)
}
```

Each voice carries `voiceId`, and `name`, `origin`, `description`, `previewUrl` and `labels` when the provider reports them. `origin` is one of:

- `premade`: the provider's stock catalog.
- `generated`: designed from a description.
- `cloned`: made from reference audio.
- `professional`: a curated or paid tier.

Leave `origins` off to get everything, including the stock voices.

Only providers with a per-account catalog implement this. Where the voice list is fixed, the provider package publishes it instead, which is better than a network call: use `GeminiTTSVoices` from `@tanstack/ai-gemini`, or the `OpenAITTSVoice` union from `@tanstack/ai-openai`. `listVoices()` throws on those adapters, and the message points at those exports.

## Provider support

| Provider | Design | Reference audio | Adapter |
| --- | --- | --- | --- |
| ElevenLabs | Yes | Yes, on `eleven_ttv_v3` | `elevenlabsVoiceDesign()` |

ElevenLabs is the only provider with a `generateVoice()` adapter today.

Providers such as OpenAI, Gemini, and Cloudflare have a fixed voice catalog. They have no `generateVoice()` adapter, and they will not get one.

xAI, BytePlus, and fal.ai each publish a voice-cloning API, so they are the
candidates for the next adapter. None is implemented here yet, and this page
will describe them once one is.

## Options

| Option | Type | Description |
| --- | --- | --- |
| `adapter` | `VoiceAdapter` | The voice adapter, created with a model. |
| `prompt` | `string` | A text description of the voice. |
| `referenceAudio` | `string \| File \| Blob \| ArrayBuffer` | A clip of the speaker to clone. |
| `name` | `string` | The name to store the voice under. |
| `description` | `string` | A description stored with the voice. |
| `modelOptions` | `object` | Provider-specific options, typed per adapter. |

You must give `prompt`, or `referenceAudio`, or both. ElevenLabs always needs `prompt`, because its design endpoint requires a description.

Each returned voice carries `voiceId`, `saved`, and `status`, plus `audio`, `format`, `contentType`, `duration`, and `language` when the provider reports them. `status` is `'ready'` on every adapter today, because they all finish the voice before returning.

## Next steps

- [Text-to-Speech](./text-to-speech): speak with the voice you made.
- [ElevenLabs adapter](../adapters/elevenlabs): model IDs and provider options.
