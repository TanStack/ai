---
id: createTranscriptionOptions
title: createTranscriptionOptions
---

# Function: createTranscriptionOptions()

```ts
function createTranscriptionOptions<TAdapter, TStream>(options): TranscriptionActivityOptions<TAdapter, TStream>;
```

Defined in: [activities/generateTranscription/index.ts:199](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/generateTranscription/index.ts#L199)

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
