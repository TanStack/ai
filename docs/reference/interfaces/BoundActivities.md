---
id: BoundActivities
title: BoundActivities
---

Defined in: packages/ai/src/activities/chat/agents/bound.ts:164

Activity functions bound to one child run. Each takes the same options as
the plain function, but `threadId` is optional: the child run fills it.
Options you pass win over the bound defaults.

## Properties

### chat

```ts
chat: <TAdapter, TSchema, TStream, TTools, TInterrupts, TContext, TMiddleware, TAgents>(options) => TextActivityResult<TSchema, TStream, TTools>;
```

Defined in: packages/ai/src/activities/chat/agents/bound.ts:165

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

`BoundTextActivityOptions`\<`TAdapter`, `TSchema`, `TStream`, `TTools`, `TInterrupts`, `TContext`, `TMiddleware`, `TAgents`\>

#### Returns

`TextActivityResult`\<`TSchema`, `TStream`, `TTools`\>

***

### decide

```ts
decide: <TAdapter, TQuestions>(options) => Promise<{ [K in string | number | symbol]: InferEvaluateAnswer<TQuestions[K]> } & object>;
```

Defined in: packages/ai/src/activities/chat/agents/bound.ts:259

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

Defined in: packages/ai/src/activities/chat/agents/bound.ts:257

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

Defined in: packages/ai/src/activities/chat/agents/bound.ts:212

#### Type Parameters

##### TAdapter

`TAdapter` *extends* [`AudioAdapter`](AudioAdapter.md)\<`string`, `AudioProviderOptions`\<`TAdapter`\>\>

##### TStream

`TStream` *extends* `boolean` = `false`

#### Parameters

##### options

`WithOptionalThreadId`\<`AudioActivityOptions`\<`TAdapter`, `TStream`\>\>

#### Returns

`AudioActivityResult`\<`TStream`\>

***

### generateImage

```ts
generateImage: <TAdapter, TStream>(options) => ImageActivityResult<TStream>;
```

Defined in: packages/ai/src/activities/chat/agents/bound.ts:200

#### Type Parameters

##### TAdapter

`TAdapter` *extends* [`ImageAdapter`](ImageAdapter.md)\<`string`, `any`, `any`, `any`, [`ModelInputModalitiesByName`](../type-aliases/ModelInputModalitiesByName.md)\>

##### TStream

`TStream` *extends* `boolean` = `false`

#### Parameters

##### options

`WithOptionalThreadId`\<`ImageActivityOptions`\<`TAdapter`, `TStream`\>\>

#### Returns

`ImageActivityResult`\<`TStream`\>

***

### generateLiveVideo

```ts
generateLiveVideo: <TAdapter, TStream>(options) => LiveVideoActivityResult<TStream>;
```

Defined in: packages/ai/src/activities/chat/agents/bound.ts:248

#### Type Parameters

##### TAdapter

`TAdapter` *extends* [`LiveVideoAdapter`](LiveVideoAdapter.md)\<`string`, `LiveVideoProviderOptions`\<`TAdapter`\>\>

##### TStream

`TStream` *extends* `boolean` = `false`

#### Parameters

##### options

`WithOptionalThreadId`\<`LiveVideoActivityOptions`\<`TAdapter`, `TStream`\>\>

#### Returns

`LiveVideoActivityResult`\<`TStream`\>

***

### generateSpeech

```ts
generateSpeech: <TAdapter, TStream>(options) => TTSActivityResult<TStream>;
```

Defined in: packages/ai/src/activities/chat/agents/bound.ts:218

#### Type Parameters

##### TAdapter

`TAdapter` *extends* [`TTSAdapter`](TTSAdapter.md)\<`string`, `TTSProviderOptions`\<`TAdapter`\>\>

##### TStream

`TStream` *extends* `boolean` = `false`

#### Parameters

##### options

`Omit`\<`TTSActivityOptionsBase`\<`TAdapter`, `TStream`\>, `"threadId"`\> & `object` & `TTSTextOrTurns`

#### Returns

`TTSActivityResult`\<`TStream`\>

***

### generateTranscription

```ts
generateTranscription: <TAdapter, TStream>(options) => TranscriptionActivityResult<TStream>;
```

Defined in: packages/ai/src/activities/chat/agents/bound.ts:231

#### Type Parameters

##### TAdapter

`TAdapter` *extends* [`TranscriptionAdapter`](TranscriptionAdapter.md)\<`string`, `TranscriptionProviderOptions`\<`TAdapter`\>\>

##### TStream

`TStream` *extends* `boolean` = `false`

#### Parameters

##### options

`WithOptionalThreadId`\<`TranscriptionActivityOptions`\<`TAdapter`, `TStream`\>\>

#### Returns

`TranscriptionActivityResult`\<`TStream`\>

***

### generateVideo

```ts
generateVideo: <TAdapter, TStream>(options) => TStream extends true ? AsyncIterable<AGUIEvent, any, any> : Promise<VideoJobResult>;
```

Defined in: packages/ai/src/activities/chat/agents/bound.ts:206

#### Type Parameters

##### TAdapter

`TAdapter` *extends* [`VideoAdapter`](VideoAdapter.md)\<`string`, `any`, `any`, `any`, `any`, `any`\>

##### TStream

`TStream` *extends* `boolean` = `false`

#### Parameters

##### options

`WithOptionalThreadId`\<`VideoCreateOptions`\<`TAdapter`, `TStream`\>\>

#### Returns

`TStream` *extends* `true` ? `AsyncIterable`\<[`AGUIEvent`](../type-aliases/AGUIEvent.md), `any`, `any`\> : `Promise`\<[`VideoJobResult`](VideoJobResult.md)\>

***

### generateVoice

```ts
generateVoice: <TAdapter, TStream>(options) => VoiceActivityResult<TStream>;
```

Defined in: packages/ai/src/activities/chat/agents/bound.ts:225

#### Type Parameters

##### TAdapter

`TAdapter` *extends* [`VoiceAdapter`](VoiceAdapter.md)\<`string`, `VoiceProviderOptions`\<`TAdapter`\>\>

##### TStream

`TStream` *extends* `boolean` = `false`

#### Parameters

##### options

`WithOptionalThreadId`\<`VoiceActivityOptions`\<`TAdapter`, `TStream`\>\>

#### Returns

`VoiceActivityResult`\<`TStream`\>

***

### generateWorld

```ts
generateWorld: <TAdapter, TStream>(options) => WorldActivityResult<TStream>;
```

Defined in: packages/ai/src/activities/chat/agents/bound.ts:242

#### Type Parameters

##### TAdapter

`TAdapter` *extends* [`WorldAdapter`](WorldAdapter.md)\<`string`, `WorldProviderOptions`\<`TAdapter`\>\>

##### TStream

`TStream` *extends* `boolean` = `false`

#### Parameters

##### options

`WithOptionalThreadId`\<`WorldActivityOptions`\<`TAdapter`, `TStream`\>\>

#### Returns

`WorldActivityResult`\<`TStream`\>

***

### rerank

```ts
rerank: <TAdapter, TDocument>(options) => Promise<RerankResult<TDocument>>;
```

Defined in: packages/ai/src/activities/chat/agents/bound.ts:258

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

Defined in: packages/ai/src/activities/chat/agents/bound.ts:194

#### Type Parameters

##### TAdapter

`TAdapter` *extends* [`SummarizeAdapter`](SummarizeAdapter.md)\<`string`, `object`\>

##### TStream

`TStream` *extends* `boolean` = `false`

#### Parameters

##### options

`WithOptionalThreadId`\<`SummarizeActivityOptions`\<`TAdapter`, `TStream`\>\>

#### Returns

`SummarizeActivityResult`\<`TStream`\>
