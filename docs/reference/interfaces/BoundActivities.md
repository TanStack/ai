---
id: BoundActivities
title: BoundActivities
---

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:97](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L97)

Activity functions bound to one child run. Each takes the same options as
the plain function. Options you pass win over the bound defaults.

## Properties

### chat

```ts
chat: <TAdapter, TSchema, TStream, TTools, TInterrupts, TContext, TMiddleware, TAgents>(options) => TextActivityResult<TSchema, TStream, TTools>;
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:98](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L98)

Text activity - handles agentic text generation, one-shot text generation, and agentic structured output.

This activity supports four modes:
1. **Streaming agentic text**: Stream responses with automatic tool execution
2. **Streaming one-shot text**: Simple streaming request/response without tools
3. **Non-streaming text**: Returns a ChatResult with the text and every chunk (stream: false)
4. **Agentic structured output**: Run tools, then return structured data

#### Type Parameters

##### TAdapter

`TAdapter` *extends* [`AnyTextAdapter`](../type-aliases/AnyTextAdapter.md)

##### TSchema

`TSchema` *extends* [`SchemaInput`](../type-aliases/SchemaInput.md) \| `undefined` = `undefined`

##### TStream

`TStream` *extends* `boolean` = `boolean`

##### TTools

`TTools` *extends* 
  \| readonly (
  \| `Omit`\<[`Tool`](Tool.md)\<`any`, `any`, `any`, `any`\>, `"execute"`\> & `object` & `object`
  \| [`ProviderTool`](ProviderTool.md)\<`string`, `TAdapter`\[`"~types"`\]\[`"toolCapabilities"`\]\[`number`\]\>)[]
  \| `undefined` = 
  \| readonly (
  \| `Omit`\<[`Tool`](Tool.md)\<`any`, `any`, `any`, `any`\>, `"execute"`\> & `object` & `object`
  \| [`ProviderTool`](ProviderTool.md)\<`string`, `TAdapter`\[`"~types"`\]\[`"toolCapabilities"`\]\[`number`\]\>)[]
  \| `undefined`

##### TInterrupts

`TInterrupts` *extends* readonly [`InterruptDefinition`](InterruptDefinition.md)\<`any`, `any`, `any`, `any`, `any`\>[] = \[\]

##### TContext

`TContext` = `unknown`

##### TMiddleware

`TMiddleware` *extends* `unknown`[] \| `undefined` = `undefined`

##### TAgents

`TAgents` *extends* readonly [`DefinedAgent`](DefinedAgent.md)\<`string`, readonly `SubagentTool`[], [`SchemaInput`](../type-aliases/SchemaInput.md) \| `undefined`, readonly [`InterruptDefinition`](InterruptDefinition.md)\<`any`, `any`, `any`, `any`, `any`\>[], `any`, `unknown`, [`AgentProduces`](../type-aliases/AgentProduces.md) \| `undefined`\>[] = readonly [`DefinedAgent`](DefinedAgent.md)\<`string`, readonly `SubagentTool`[], [`SchemaInput`](../type-aliases/SchemaInput.md) \| `undefined`, readonly [`InterruptDefinition`](InterruptDefinition.md)\<`any`, `any`, `any`, `any`, `any`\>[], `any`, `unknown`, [`AgentProduces`](../type-aliases/AgentProduces.md) \| `undefined`\>[]

#### Parameters

##### options

`TextActivityOptionsWithContext`\<`TAdapter`, `TSchema`, `TStream`, `TTools`, `TInterrupts`, `TContext`, `TMiddleware`, `TAgents`\>

#### Returns

`TextActivityResult`\<`TSchema`, `TStream`, `TTools`\>

#### Examples

**Full agentic text (streaming with tools)**

```ts
import { chat } from '@tanstack/ai'
import { openaiText } from '@tanstack/ai-openai'

for await (const chunk of chat({
  adapter: openaiText('gpt-5.5'),
  messages: [{ role: 'user', content: 'What is the weather?' }],
  tools: [weatherTool]
})) {
  if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
    console.log(chunk.delta)
  }
}
```

**One-shot text (streaming without tools)**

```ts
for await (const chunk of chat({
  adapter: openaiText('gpt-5.5'),
  messages: [{ role: 'user', content: 'Hello!' }]
})) {
  console.log(chunk)
}
```

**Non-streaming text (stream: false)**

```ts
const { text, chunks } = await chat({
  adapter: openaiText('gpt-5.5'),
  messages: [{ role: 'user', content: 'Hello!' }],
  stream: false
})
// text is a string with the full response
// chunks is every chunk the run produced, in order
```

**Agentic structured output (tools + structured response)**

```ts
import { z } from 'zod'

const result = await chat({
  adapter: openaiText('gpt-5.5'),
  messages: [{ role: 'user', content: 'Research and summarize the topic' }],
  tools: [researchTool, analyzeTool],
  outputSchema: z.object({
    summary: z.string(),
    keyPoints: z.array(z.string())
  })
})
// result is { summary: string, keyPoints: string[] }
```

***

### decide

```ts
decide: <TAdapter, TQuestions>(options) => Promise<{ [K in string | number | symbol]: InferEvaluateAnswer<TQuestions[K]> } & object>;
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:110](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L110)

Ask typed questions about `state` and get answers your code can branch on.

You have state (a ticket, a record, a log) and you need typed answers, not
prose. Pass questions built with `choice`, `score`, and `boolean`. Then
branch on `result.queue.value` in ordinary TypeScript.

The question key `meta` is reserved. Throws if `questions` is empty or uses
that key.

#### Type Parameters

##### TAdapter

`TAdapter` *extends* [`EvaluateAdapter`](EvaluateAdapter.md)\<`string`, `EvaluateProviderOptions`\<`TAdapter`\>\>

##### TQuestions

`TQuestions` *extends* `Record`\<`string`, [`WireQuestion`](../type-aliases/WireQuestion.md)\>

#### Parameters

##### options

`EvaluateActivityOptions`\<`TAdapter`, `TQuestions`\>

#### Returns

`Promise`\<\{ \[K in string \| number \| symbol\]: InferEvaluateAnswer\<TQuestions\[K\]\> \} & `object`\>

#### Example

**Route a support ticket**

```ts
import { decide, choice, score, boolean } from '@tanstack/ai'
import { typesafeDecider } from '@tanstack/ai-typesafe'

const result = await decide({
  adapter: typesafeDecider('jev-latest'),
  state: ticket,
  questions: {
    queue: choice({
      instructions: 'Which team should handle this ticket?',
      options: {
        billing: 'Payments, invoices, refunds',
        tech: 'Bugs, outages, integrations',
        sales: 'Pricing, upgrades, new accounts',
      },
    }),
    urgency: score({
      instructions: 'How urgent is this ticket?',
      levels: ['low', 'medium', 'high'],
    }),
    refund: boolean({
      instructions: 'Is the customer asking for a refund?',
    }),
  },
})

result.queue.value
result.meta.model
result.meta.usage
```

***

### embed

```ts
embed: <TAdapter>(options) => Promise<EmbeddingResult>;
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:108](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L108)

Embed activity - generates embedding vectors from text and image inputs.

Accepts a single item or an array of items; the result always carries an
`embeddings` array with one vector per input item, in input order.

#### Type Parameters

##### TAdapter

`TAdapter` *extends* [`EmbeddingAdapter`](EmbeddingAdapter.md)\<`string`, `any`, `any`, `any`\>

#### Parameters

##### options

`EmbedOptions`\<`TAdapter`\>

#### Returns

`Promise`\<[`EmbeddingResult`](EmbeddingResult.md)\>

#### Examples

**Embed a single text**

```ts
import { embed } from '@tanstack/ai'
import { openaiEmbedding } from '@tanstack/ai-openai'

const result = await embed({
  adapter: openaiEmbedding('text-embedding-3-small'),
  input: 'a red guitar',
})

console.log(result.embeddings[0].vector)
```

**Batch with requested dimensions**

```ts
const result = await embed({
  adapter: openaiEmbedding('text-embedding-3-large'),
  input: ['a red guitar', 'a blue drum kit'],
  dimensions: 1024,
})
```

**Multimodal embedding (text + image fused into one vector)**

```ts
import { cohereEmbedding } from '@tanstack/ai-cohere'

// A nested array of parts fuses them into a single vector. The outer array
// is the item list, so this embeds one fused item into one vector.
const result = await embed({
  adapter: cohereEmbedding('embed-v4.0'),
  input: [
    [
      { type: 'text', content: 'product photo' },
      { type: 'image', source: { type: 'data', value: base64, mimeType: 'image/png' } },
    ],
  ],
  modelOptions: { inputType: 'search_document' },
})
```

***

### generateAudio

```ts
generateAudio: <TAdapter, TStream>(options) => AudioActivityResult<TStream>;
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:102](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L102)

Audio generation activity - generates audio from text prompts.

Uses AI models to create music, sound effects, and other audio content.

#### Type Parameters

##### TAdapter

`TAdapter` *extends* [`AudioAdapter`](AudioAdapter.md)\<`string`, `AudioProviderOptions`\<`TAdapter`\>\>

##### TStream

`TStream` *extends* `boolean` = `false`

#### Parameters

##### options

`AudioActivityOptions`\<`TAdapter`, `TStream`\>

#### Returns

`AudioActivityResult`\<`TStream`\>

#### Example

**Generate music from a prompt**

```ts
import { generateAudio } from '@tanstack/ai'
import { falAudio } from '@tanstack/ai-fal'

const result = await generateAudio({
  adapter: falAudio('fal-ai/diffrhythm'),
  prompt: 'An upbeat electronic track with synths',
  duration: 10
})

console.log(result.audio.url) // URL to generated audio
```

***

### generateImage

```ts
generateImage: <TAdapter, TStream>(options) => ImageActivityResult<TStream>;
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:100](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L100)

Image activity - generates images from text prompts.

Uses AI image generation models to create images based on natural language descriptions.

#### Type Parameters

##### TAdapter

`TAdapter` *extends* [`ImageAdapter`](ImageAdapter.md)\<`string`, `any`, `any`, `any`, [`ModelInputModalitiesByName`](../type-aliases/ModelInputModalitiesByName.md)\>

##### TStream

`TStream` *extends* `boolean` = `false`

#### Parameters

##### options

`ImageActivityOptions`\<`TAdapter`, `TStream`\>

#### Returns

`ImageActivityResult`\<`TStream`\>

#### Examples

**Generate a single image**

```ts
import { generateImage } from '@tanstack/ai'
import { openaiImage } from '@tanstack/ai-openai'

const result = await generateImage({
  adapter: openaiImage('dall-e-3'),
  prompt: 'A serene mountain landscape at sunset'
})

console.log(result.images[0].url)
```

**Generate multiple images**

```ts
const result = await generateImage({
  adapter: openaiImage('dall-e-2'),
  prompt: 'A cute robot mascot',
  numberOfImages: 4,
  size: '512x512'
})

result.images.forEach((image, i) => {
  console.log(`Image ${i + 1}: ${image.url}`)
})
```

**With provider-specific options**

```ts
const result = await generateImage({
  adapter: openaiImage('dall-e-3'),
  prompt: 'A professional headshot photo',
  size: '1024x1024',
  modelOptions: {
    quality: 'hd',
    style: 'natural'
  }
})
```

***

### generateLiveVideo

```ts
generateLiveVideo: <TAdapter, TStream>(options) => LiveVideoActivityResult<TStream>;
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:107](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L107)

**`Experimental`**

Live generation activity - opens a live, prompt-steerable video session.

#### Type Parameters

##### TAdapter

`TAdapter` *extends* [`LiveVideoAdapter`](LiveVideoAdapter.md)\<`string`, `LiveVideoProviderOptions`\<`TAdapter`\>\>

##### TStream

`TStream` *extends* `boolean` = `false`

#### Parameters

##### options

`LiveVideoActivityOptions`\<`TAdapter`, `TStream`\>

#### Returns

`LiveVideoActivityResult`\<`TStream`\>

#### Example

**Mint a session token on the server**

```ts
import { generateLiveVideo } from '@tanstack/ai'
import { reactorVideo } from '@tanstack/ai-reactor'

const live = await generateLiveVideo({
  adapter: reactorVideo('helios'),
  prompt: 'A red sports car powerslides a mountain hairpin',
})

// Hand live.token, live.model, and live.prompt to the browser.
```

 Live generation is an experimental feature and may change.

***

### generateSpeech

```ts
generateSpeech: <TAdapter, TStream>(options) => TTSActivityResult<TStream>;
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:103](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L103)

TTS activity - generates speech from text.

Uses AI text-to-speech models to create audio from natural language text.

#### Type Parameters

##### TAdapter

`TAdapter` *extends* [`TTSAdapter`](TTSAdapter.md)\<`string`, `TTSProviderOptions`\<`TAdapter`\>\>

##### TStream

`TStream` *extends* `boolean` = `false`

#### Parameters

##### options

`TTSActivityOptions`\<`TAdapter`, `TStream`\>

#### Returns

`TTSActivityResult`\<`TStream`\>

#### Examples

**Generate speech from text**

```ts
import { generateSpeech } from '@tanstack/ai'
import { openaiSpeech } from '@tanstack/ai-openai'

const result = await generateSpeech({
  adapter: openaiSpeech('tts-1-hd'),
  text: 'Hello, welcome to TanStack AI!',
  voice: 'nova'
})

console.log(result.audio) // base64-encoded audio
```

**With format and speed options**

```ts
const result = await generateSpeech({
  adapter: openaiSpeech('tts-1'),
  text: 'This is slower speech.',
  voice: 'alloy',
  format: 'wav',
  speed: 0.8
})
```

***

### generateTranscription

```ts
generateTranscription: <TAdapter, TStream>(options) => TranscriptionActivityResult<TStream>;
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:105](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L105)

Transcription activity - converts audio to text.

Uses AI speech-to-text models to transcribe audio content.

#### Type Parameters

##### TAdapter

`TAdapter` *extends* [`TranscriptionAdapter`](TranscriptionAdapter.md)\<`string`, `TranscriptionProviderOptions`\<`TAdapter`\>\>

##### TStream

`TStream` *extends* `boolean` = `false`

#### Parameters

##### options

`TranscriptionActivityOptions`\<`TAdapter`, `TStream`\>

#### Returns

`TranscriptionActivityResult`\<`TStream`\>

#### Examples

**Transcribe an audio file**

```ts
import { generateTranscription } from '@tanstack/ai'
import { openaiTranscription } from '@tanstack/ai-openai'

const result = await generateTranscription({
  adapter: openaiTranscription('whisper-1'),
  audio: audioFile, // File, Blob, or base64 string
  language: 'en'
})

console.log(result.text)
```

**With verbose output for timestamps**

```ts
const result = await generateTranscription({
  adapter: openaiTranscription('whisper-1'),
  audio: audioFile,
  responseFormat: 'verbose_json'
})

result.segments?.forEach(segment => {
  console.log(`[${segment.start}s - ${segment.end}s]: ${segment.text}`)
})
```

**Streaming transcription result**

```ts
for await (const chunk of generateTranscription({
  adapter: openaiTranscription('whisper-1'),
  audio: audioFile,
  stream: true
})) {
  console.log(chunk)
}
```

***

### generateVideo

```ts
generateVideo: <TAdapter, TStream>(options) => TStream extends true ? AsyncIterable<AGUIEvent, any, any> : Promise<VideoJobResult>;
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:101](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L101)

**`Experimental`**

Generate video - creates a video generation job from a text prompt.

Uses AI video generation models to create videos based on natural language descriptions.
Unlike image generation, video generation is asynchronous and requires polling for completion.

When `stream: true` is passed, handles the full job lifecycle automatically:
create job → poll for status → stream updates → yield final result.

 Video generation is an experimental feature and may change.

#### Type Parameters

##### TAdapter

`TAdapter` *extends* [`VideoAdapter`](VideoAdapter.md)\<`string`, `any`, `any`, `any`, `any`, `any`\>

##### TStream

`TStream` *extends* `boolean` = `false`

#### Parameters

##### options

`VideoCreateOptions`\<`TAdapter`, `TStream`\>

#### Returns

`TStream` *extends* `true` ? `AsyncIterable`\<[`AGUIEvent`](../type-aliases/AGUIEvent.md), `any`, `any`\> : `Promise`\<[`VideoJobResult`](VideoJobResult.md)\>

#### Examples

**Create a video generation job**

```ts
import { generateVideo, getVideoJobStatus } from '@tanstack/ai'
import { openaiVideo } from '@tanstack/ai-openai'

// Start a video generation job
const { jobId } = await generateVideo({
  adapter: openaiVideo('sora-2'),
  prompt: 'A cat chasing a dog in a sunny park'
})

console.log('Job started:', jobId)

// The submission only OPENS the run; the poll that sees a terminal state is
// what completes it. The `jobId` is the whole correlation — pass the same
// `middleware` and `threadId` when you use them.
const status = await getVideoJobStatus({
  adapter: openaiVideo('sora-2'),
  jobId,
})
```

**Stream the full video generation lifecycle**

```ts
import { generateVideo, toServerSentEventsResponse } from '@tanstack/ai'
import { openaiVideo } from '@tanstack/ai-openai'

const stream = generateVideo({
  adapter: openaiVideo('sora-2'),
  prompt: 'A cat chasing a dog in a sunny park',
  stream: true,
  pollingInterval: 3000,
})

return toServerSentEventsResponse(stream)
```

***

### generateVoice

```ts
generateVoice: <TAdapter, TStream>(options) => VoiceActivityResult<TStream>;
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:104](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L104)

Voice activity - creates a reusable voice.

Providers create voices in one of two ways, and some support both: design a
new voice from a text description, or clone one from reference audio. Either
way the result carries voice ids you pass back to `generateSpeech()`.

#### Type Parameters

##### TAdapter

`TAdapter` *extends* [`VoiceAdapter`](VoiceAdapter.md)\<`string`, `VoiceProviderOptions`\<`TAdapter`\>\>

##### TStream

`TStream` *extends* `boolean` = `false`

#### Parameters

##### options

`VoiceActivityOptions`\<`TAdapter`, `TStream`\>

#### Returns

`VoiceActivityResult`\<`TStream`\>

#### Examples

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
  adapter: elevenlabsSpeech('eleven_v4'),
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

***

### generateWorld

```ts
generateWorld: <TAdapter, TStream>(options) => WorldActivityResult<TStream>;
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:106](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L106)

**`Experimental`**

World generation activity. Live adapters mint a session token. Job
adapters return a viewer URL or an in-progress operation id.

#### Type Parameters

##### TAdapter

`TAdapter` *extends* [`WorldAdapter`](WorldAdapter.md)\<`string`, `WorldProviderOptions`\<`TAdapter`\>\>

##### TStream

`TStream` *extends* `boolean` = `false`

#### Parameters

##### options

`WorldActivityOptions`\<`TAdapter`, `TStream`\>

#### Returns

`WorldActivityResult`\<`TStream`\>

#### Example

**Mint a session token on the server**

```ts
import { generateWorld } from '@tanstack/ai'
import { reactorWorld } from '@tanstack/ai-reactor'

const world = await generateWorld({
  adapter: reactorWorld('visko-orbis-stable'),
  prompt: 'A neon cyberpunk city at night, slow aerial drift',
})

// Hand world.token, world.model, and world.prompt to the browser.
```

 World generation is an experimental feature and may change.

***

### rerank

```ts
rerank: <TAdapter, TDocument>(options) => Promise<RerankResult<TDocument>>;
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:109](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L109)

Rerank activity - reorders documents by relevance to a query.

#### Type Parameters

##### TAdapter

`TAdapter` *extends* [`RerankAdapter`](RerankAdapter.md)\<`string`, `RerankProviderOptions`\<`TAdapter`\>\>

##### TDocument

`TDocument` *extends* `string` \| `object` = `string`

#### Parameters

##### options

`RerankActivityOptions`\<`TAdapter`, `TDocument`\>

#### Returns

`Promise`\<[`RerankResult`](RerankResult.md)\<`TDocument`\>\>

#### Examples

**Basic reranking**

```ts
import { rerank } from '@tanstack/ai'
import { cohereRerank } from '@tanstack/ai-cohere'

const { ranking, rerankedDocuments } = await rerank({
  adapter: cohereRerank('rerank-v3.5'),
  query: 'talk about rain',
  documents: ['sunny day at the beach', 'rainy afternoon in the city'],
  topN: 2,
})

console.log(rerankedDocuments[0]) // 'rainy afternoon in the city'
```

**Reranking object documents**

```ts
const { ranking } = await rerank({
  adapter: cohereRerank('rerank-v3.5'),
  query: 'best laptop for travel',
  documents: [
    { id: 1, text: 'A heavy gaming desktop' },
    { id: 2, text: 'A lightweight ultrabook with all-day battery' },
  ],
})

// ranking[0].document is the original object, fully typed.
console.log(ranking[0].document.id)
```

***

### summarize

```ts
summarize: <TAdapter, TStream>(options) => SummarizeActivityResult<TStream>;
```

Defined in: [packages/ai/src/activities/chat/agents/bound.ts:99](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/agents/bound.ts#L99)

Summarize activity - generates summaries from text.

Supports both streaming and non-streaming modes.

#### Type Parameters

##### TAdapter

`TAdapter` *extends* [`SummarizeAdapter`](SummarizeAdapter.md)\<`string`, `object`\>

##### TStream

`TStream` *extends* `boolean` = `false`

#### Parameters

##### options

`SummarizeActivityOptions`\<`TAdapter`, `TStream`\>

#### Returns

`SummarizeActivityResult`\<`TStream`\>

#### Examples

**Basic summarization**

```ts
import { summarize } from '@tanstack/ai'
import { openaiSummarize } from '@tanstack/ai-openai'

const result = await summarize({
  adapter: openaiSummarize('gpt-4o-mini'),
  text: 'Long article text here...'
})

console.log(result.summary)
```

**Summarization with style**

```ts
const result = await summarize({
  adapter: openaiSummarize('gpt-4o-mini'),
  text: 'Long article text here...',
  style: 'bullet-points',
  maxLength: 100
})
```

**Focused summarization**

```ts
const result = await summarize({
  adapter: openaiSummarize('gpt-4o-mini'),
  text: 'Long technical document...',
  focus: ['key findings', 'methodology']
})
```

**Streaming summarization**

```ts
for await (const chunk of summarize({
  adapter: openaiSummarize('gpt-4o-mini'),
  text: 'Long article text here...',
  stream: true
})) {
  if (chunk.type === 'content') {
    process.stdout.write(chunk.delta)
  }
}
```
