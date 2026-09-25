---
id: convertMessagesToModelMessages
title: convertMessagesToModelMessages
---

```ts
function convertMessagesToModelMessages(messages): ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/ai/src/activities/chat/messages.ts:175](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/messages.ts#L175)

Convert UIMessages or ModelMessages to ModelMessages

## Parameters

### messages

(
  \| [`UIMessage`](../interfaces/UIMessage.md)\<`unknown`\>
  \| [`ModelMessage`](../interfaces/ModelMessage.md)\<
  \| `string`
  \| [`ContentPart`](../type-aliases/ContentPart.md)\<`unknown`, `unknown`, `unknown`, `unknown`, `unknown`\>[]
  \| `null`\>)[]

## Returns

[`ModelMessage`](../interfaces/ModelMessage.md)\<
  \| `string`
  \| [`ContentPart`](../type-aliases/ContentPart.md)\<`unknown`, `unknown`, `unknown`, `unknown`, `unknown`\>[]
  \| `null`\>[]
