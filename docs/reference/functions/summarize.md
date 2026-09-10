---
id: summarize
title: summarize
---

# Function: summarize()

```ts
function summarize<TAdapter, TStream>(options): SummarizeActivityResult<TStream>;
```

Defined in: [packages/ai/src/activities/summarize/index.ts:207](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/summarize/index.ts#L207)

Summarize activity - generates summaries from text.

Supports both streaming and non-streaming modes.

## Type Parameters

### TAdapter

`TAdapter` *extends* [`SummarizeAdapter`](../interfaces/SummarizeAdapter.md)\<`string`, `object`\>

### TStream

`TStream` *extends* `boolean` = `false`

## Parameters

### options

`SummarizeActivityOptions`\<`TAdapter`, `TStream`\>

## Returns

`SummarizeActivityResult`\<`TStream`\>

## Examples

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
