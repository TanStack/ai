---
id: textOptions
title: textOptions
---

# Function: textOptions()

```ts
function textOptions<TAdapter, TModel>(options): Omit<TextStreamOptionsUnion<TAdapter>, "model" | "providerOptions" | "messages" | "abortController"> & object;
```

Defined in: [utilities/chat-options.ts:3](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/utilities/chat-options.ts#L3)

## Type Parameters

### TAdapter

`TAdapter` *extends* [`AIAdapter`](../interfaces/AIAdapter.md)\<`any`, `any`, `any`, `any`, `any`, `Record`\<`string`, readonly [`Modality`](../type-aliases/Modality.md)[]\>, [`DefaultMessageMetadataByModality`](../interfaces/DefaultMessageMetadataByModality.md)\>

### TModel

`TModel` *extends* `any`

## Parameters

### options

`Omit`\<[`TextStreamOptionsUnion`](../type-aliases/TextStreamOptionsUnion.md)\<`TAdapter`\>, `"model"` \| `"providerOptions"` \| `"messages"` \| `"abortController"`\> & `object`

## Returns

`Omit`\<[`TextStreamOptionsUnion`](../type-aliases/TextStreamOptionsUnion.md)\<`TAdapter`\>, `"model"` \| `"providerOptions"` \| `"messages"` \| `"abortController"`\> & `object`
