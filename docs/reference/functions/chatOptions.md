---
id: chatOptions
title: chatOptions
---

# Function: chatOptions()

```ts
function chatOptions<TAdapter, TModel>(options): Omit<ChatStreamOptionsUnion<TAdapter>, "model" | "providerOptions" | "messages" | "abortController"> & object;
```

Defined in: [utilities/chat-options.ts:3](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/utilities/chat-options.ts#L3)

## Type Parameters

### TAdapter

`TAdapter` *extends* [`AIAdapter`](../../interfaces/AIAdapter)\<`any`, `any`, `any`, `any`, `any`, `Record`\<`string`, readonly [`Modality`](../../type-aliases/Modality)[]\>, [`DefaultMessageMetadataByModality`](../../interfaces/DefaultMessageMetadataByModality)\>

### TModel

`TModel` *extends* `any`

## Parameters

### options

`Omit`\<[`ChatStreamOptionsUnion`](../../type-aliases/ChatStreamOptionsUnion)\<`TAdapter`\>, `"model"` \| `"providerOptions"` \| `"messages"` \| `"abortController"`\> & `object`

## Returns

`Omit`\<[`ChatStreamOptionsUnion`](../../type-aliases/ChatStreamOptionsUnion)\<`TAdapter`\>, `"model"` \| `"providerOptions"` \| `"messages"` \| `"abortController"`\> & `object`
