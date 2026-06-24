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

Defined in: [packages/ai/src/activities/chat/messages.ts:81](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/messages.ts#L81)

Convert UIMessages or ModelMessages to ModelMessages

## Parameters

### messages

(
  \| [`ModelMessage`](../interfaces/ModelMessage.md)\<
  \| `string`
  \| [`ContentPart`](../type-aliases/ContentPart.md)\<`unknown`, `unknown`, `unknown`, `unknown`, `unknown`\>[]
  \| `null`\>
  \| [`UIMessage`](../interfaces/UIMessage.md)\<`unknown`\>)[]

## Returns

[`ModelMessage`](../interfaces/ModelMessage.md)\<
  \| `string`
  \| [`ContentPart`](../type-aliases/ContentPart.md)\<`unknown`, `unknown`, `unknown`, `unknown`, `unknown`\>[]
  \| `null`\>[]
