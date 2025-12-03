---
id: messages
title: messages
---

# Function: messages()

```ts
function messages<TAdapter, TModel>(_options, msgs): TAdapter extends AIAdapter<any, any, any, any, any, ModelInputModalities, DefaultMessageMetadataByModality> ? TModel extends keyof ModelInputModalities ? ModelInputModalities[TModel<TModel>] extends readonly Modality[] ? ConstrainedModelMessage<any[any]>[] : ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown>[]
  | null>[] : ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown>[]
  | null>[] : ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [utilities/messages.ts:33](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/utilities/messages.ts#L33)

Type-safe helper to create a messages array constrained by a model's supported modalities.

This function provides compile-time checking that your messages only contain
content types supported by the specified model. It's particularly useful when
combining typed messages with untyped data (like from request.json()).

## Type Parameters

### TAdapter

`TAdapter` *extends* [`AIAdapter`](../interfaces/AIAdapter.md)\<`any`, `any`, `any`, `any`, `any`, `any`, [`DefaultMessageMetadataByModality`](../interfaces/DefaultMessageMetadataByModality.md)\>

### TModel

`TModel` *extends* `any`

## Parameters

### \_options

#### adapter

`TAdapter`

#### model

`TModel`

### msgs

`TAdapter` *extends* [`AIAdapter`](../interfaces/AIAdapter.md)\<`any`, `any`, `any`, `any`, `any`, `ModelInputModalities`, [`DefaultMessageMetadataByModality`](../interfaces/DefaultMessageMetadataByModality.md)\> ? `TModel` *extends* keyof `ModelInputModalities` ? `ModelInputModalities`\[`TModel`\<`TModel`\>\] *extends* readonly [`Modality`](../type-aliases/Modality.md)[] ? [`ConstrainedModelMessage`](../type-aliases/ConstrainedModelMessage.md)\<`any`\[`any`\]\>[] : [`ModelMessage`](../interfaces/ModelMessage.md)\<
  \| `string`
  \| [`ContentPart`](../type-aliases/ContentPart.md)\<`unknown`, `unknown`, `unknown`, `unknown`\>[]
  \| `null`\>[] : [`ModelMessage`](../interfaces/ModelMessage.md)\<
  \| `string`
  \| [`ContentPart`](../type-aliases/ContentPart.md)\<`unknown`, `unknown`, `unknown`, `unknown`\>[]
  \| `null`\>[] : [`ModelMessage`](../interfaces/ModelMessage.md)\<
  \| `string`
  \| [`ContentPart`](../type-aliases/ContentPart.md)\<`unknown`, `unknown`, `unknown`, `unknown`\>[]
  \| `null`\>[]

## Returns

`TAdapter` *extends* [`AIAdapter`](../interfaces/AIAdapter.md)\<`any`, `any`, `any`, `any`, `any`, `ModelInputModalities`, [`DefaultMessageMetadataByModality`](../interfaces/DefaultMessageMetadataByModality.md)\> ? `TModel` *extends* keyof `ModelInputModalities` ? `ModelInputModalities`\[`TModel`\<`TModel`\>\] *extends* readonly [`Modality`](../type-aliases/Modality.md)[] ? [`ConstrainedModelMessage`](../type-aliases/ConstrainedModelMessage.md)\<`any`\[`any`\]\>[] : [`ModelMessage`](../interfaces/ModelMessage.md)\<
  \| `string`
  \| [`ContentPart`](../type-aliases/ContentPart.md)\<`unknown`, `unknown`, `unknown`, `unknown`\>[]
  \| `null`\>[] : [`ModelMessage`](../interfaces/ModelMessage.md)\<
  \| `string`
  \| [`ContentPart`](../type-aliases/ContentPart.md)\<`unknown`, `unknown`, `unknown`, `unknown`\>[]
  \| `null`\>[] : [`ModelMessage`](../interfaces/ModelMessage.md)\<
  \| `string`
  \| [`ContentPart`](../type-aliases/ContentPart.md)\<`unknown`, `unknown`, `unknown`, `unknown`\>[]
  \| `null`\>[]

## Example

```typescript
import { messages, chat } from '@tanstack/ai'
import { openai } from '@tanstack/ai-openai'

const adapter = openai()

// This will error at compile time because gpt-4o only supports text+image
const msgs = messages({ adapter, model: 'gpt-4o' }, [
  {
    role: 'user',
    content: [
      { type: 'video', source: { type: 'url', value: '...' } } // Error!
    ]
  }
])
```
