---
id: convertMessagesToModelMessages
title: convertMessagesToModelMessages
---

# Function: convertMessagesToModelMessages()

```ts
function convertMessagesToModelMessages(messages): ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [activities/chat/messages.ts:63](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/messages.ts#L63)

Convert UIMessages or ModelMessages to ModelMessages

## Parameters

### messages

(
  \| [`UIMessage`](../interfaces/UIMessage.md)
  \| [`ModelMessage`](../interfaces/ModelMessage.md)\<
  \| `string`
  \| [`ContentPart`](../type-aliases/ContentPart.md)\<`unknown`, `unknown`, `unknown`, `unknown`, `unknown`\>[]
  \| `null`\>)[]

## Returns

[`ModelMessage`](../interfaces/ModelMessage.md)\<
  \| `string`
  \| [`ContentPart`](../type-aliases/ContentPart.md)\<`unknown`, `unknown`, `unknown`, `unknown`, `unknown`\>[]
  \| `null`\>[]
