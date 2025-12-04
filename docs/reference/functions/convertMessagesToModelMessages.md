---
id: convertMessagesToModelMessages
title: convertMessagesToModelMessages
---

# Function: convertMessagesToModelMessages()

```ts
function convertMessagesToModelMessages(messages): ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [message-converters.ts:38](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/message-converters.ts#L38)

Convert UIMessages or ModelMessages to ModelMessages

## Parameters

### messages

(
  \| [`UIMessage`](../../interfaces/UIMessage)
  \| [`ModelMessage`](../../interfaces/ModelMessage)\<
  \| `string`
  \| [`ContentPart`](../../type-aliases/ContentPart)\<`unknown`, `unknown`, `unknown`, `unknown`\>[]
  \| `null`\>)[]

## Returns

[`ModelMessage`](../../interfaces/ModelMessage)\<
  \| `string`
  \| [`ContentPart`](../../type-aliases/ContentPart)\<`unknown`, `unknown`, `unknown`, `unknown`\>[]
  \| `null`\>[]
