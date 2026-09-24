---
id: generateVoice
title: generateVoice
---

```ts
function generateVoice<TAdapter, TStream>(options): VoiceActivityResult<TStream>;
```

Defined in: [packages/ai/src/activities/generateVoice/index.ts:185](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateVoice/index.ts#L185)

Voice activity - creates a reusable voice.

Providers create voices in one of two ways, and some support both: design a
new voice from a text description, or clone one from reference audio. Either
way the result carries voice ids you pass back to `generateSpeech()`.

## Type Parameters

### TAdapter

`TAdapter` *extends* [`VoiceAdapter`](../interfaces/VoiceAdapter.md)\<`string`, `VoiceProviderOptions`\<`TAdapter`\>\>

### TStream

`TStream` *extends* `boolean` = `false`

## Parameters

### options

`VoiceActivityOptions`\<`TAdapter`, `TStream`\>

## Returns

`VoiceActivityResult`\<`TStream`\>

## Examples

**Design a voice from a description**

```ts
import { generateVoice, generateSpeech } from '@tanstack/ai'
import { elevenlabsVoiceDesign, elevenlabsSpeech } from '@tanstack/ai-elevenlabs'

const designed = await generateVoice({
  adapter: elevenlabsVoiceDesign('eleven_ttv_v3'),
  prompt: 'A warm, gravelly narrator in his sixties with a slight Irish lilt',
})

const [preview] = designed.voices
if (!preview) throw new Error('No voice candidates returned')

const speech = await generateSpeech({
  adapter: elevenlabsSpeech('eleven_v3'),
  text: 'Once upon a time...',
  voice: preview.voiceId,
})
```

**Save the voice to the provider's library**

```ts
const saved = await generateVoice({
  adapter: elevenlabsVoiceDesign('eleven_ttv_v3'),
  prompt: 'A bright, upbeat product demo host',
  name: 'Demo Host',
  description: 'Bright, upbeat, mid-30s',
})
```
