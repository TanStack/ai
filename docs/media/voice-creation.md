---
title: Voice Creation
id: voice-creation
order: 5
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
- **Clone**: you supply a clip of a real speaker. The provider copies it.

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
console.log(saved?.saved) // true
console.log(saved?.voiceId) // A permanent voice ID. Store it.
```

Store `voiceId` in your database. Every later `generateSpeech()` call reuses it, and you never design the same voice twice.

Providers differ on what `name` means. ElevenLabs keeps a voice only when you give a name. Read `saved` on each returned voice to see what happened.

## Clone a voice from reference audio

Some models copy a real speaker from a clip. Pass the audio as `referenceAudio`.

```typescript
import { readFile } from 'node:fs/promises'
import { generateVoice } from '@tanstack/ai'
import { elevenlabsVoiceDesign } from '@tanstack/ai-elevenlabs'

const clip = await readFile('./narrator.mp3')

const result = await generateVoice({
  adapter: elevenlabsVoiceDesign('eleven_ttv_v3'),
  prompt: 'The same speaker, but younger and more energetic',
  referenceAudio: clip.buffer,
  name: 'Young Narrator',
})
```

`referenceAudio` accepts a base64 string, a base64 data URL, a `Blob`, a `File`, or an `ArrayBuffer`. A remote URL is refused: read the file yourself and pass the bytes.

CAUTION: Clone a voice only with the consent of the speaker. Most providers make this a condition of their terms.

## Wait for an async clone

Most providers finish the voice inside `generateVoice()`. Some train a clone in the background and hand you the voice before it is usable.

Read `status` to tell them apart. A voice with no `status` is ready now. A voice with `status: 'training'` is not, so poll `getVoiceStatus()` until it changes.

```typescript
import { generateVoice, getVoiceStatus } from '@tanstack/ai'
import { elevenlabsVoiceDesign } from '@tanstack/ai-elevenlabs'

const created = await generateVoice({
  adapter: elevenlabsVoiceDesign('eleven_ttv_v3'),
  prompt: 'A warm, gravelly narrator in his sixties',
  name: 'Irish Narrator',
})

const [voice] = created.voices
if (!voice) throw new Error('The provider returned no voices.')

let state = voice.status ?? 'ready'
while (state === 'training') {
  await new Promise((resolve) => setTimeout(resolve, 5000))
  const polled = await getVoiceStatus({
    adapter: elevenlabsVoiceDesign('eleven_ttv_v3'),
    voiceId: voice.voiceId,
  })
  state = polled.status
}

if (state === 'failed') throw new Error('Voice training failed.')
```

`getVoiceStatus()` throws on an adapter that has nothing to poll, and the message says so. ElevenLabs is one of those, so the loop above exits immediately for it.

## Provider support

| Provider | Design | Clone | Adapter |
| --- | --- | --- | --- |
| ElevenLabs | Yes | Yes, on `eleven_ttv_v3` | `elevenlabsVoiceDesign()` |

Other providers have a voice-creation API but no adapter yet:

- **xAI**: `POST /v1/custom-voices` clones a speaker from a clip of 120 seconds or less.
- **BytePlus**: Seed Speech Voice Replication trains a clone with `POST /api/v3/tts/voice_clone`, then you poll `POST /api/v3/tts/get_voice`. The voice slot comes from the console, so the id is an input, not a result.
- **fal.ai**: hosts clone endpoints such as `minimax/voice-clone`.

Providers such as OpenAI, Gemini, and Cloudflare have a fixed voice catalog. They have no `generateVoice()` adapter, and they will not get one.

BytePlus voice training is asynchronous, which is what `status` and `getVoiceStatus()` above are for. Its adapter returns the voice with `status: 'training'` straight away rather than holding the request open.

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

Each returned voice carries `voiceId`, and `audio`, `format`, `contentType`, `duration`, `language`, `saved`, and `status` when the provider reports them.

## Next steps

- [Text-to-Speech](./text-to-speech): speak with the voice you made.
- [ElevenLabs adapter](../adapters/elevenlabs): model IDs and provider options.
