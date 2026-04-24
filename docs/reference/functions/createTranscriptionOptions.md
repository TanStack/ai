---
id: createTranscriptionOptions
title: createTranscriptionOptions
---

# Function: createTranscriptionOptions()

```ts
function createTranscriptionOptions<TAdapter, TStream>(options): TranscriptionActivityOptions<TAdapter, TStream>;
```

Defined in: [packages/typescript/ai/src/activities/generateTranscription/index.ts:231](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateTranscription/index.ts#L231)

Create typed options for the generateTranscription() function without executing.

## Type Parameters

### TAdapter

`TAdapter` *extends* [`TranscriptionAdapter`](../interfaces/TranscriptionAdapter.md)\<`string`, `object`\>

### TStream

`TStream` *extends* `boolean` = `false`

## Parameters

### options

`TranscriptionActivityOptions`\<`TAdapter`, `TStream`\>

## Returns

`TranscriptionActivityOptions`\<`TAdapter`, `TStream`\>
