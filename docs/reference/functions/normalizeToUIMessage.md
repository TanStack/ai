---
id: normalizeToUIMessage
title: normalizeToUIMessage
---

```ts
function normalizeToUIMessage(message, generateId): UIMessage;
```

Defined in: [packages/ai/src/activities/chat/messages.ts:1295](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/messages.ts#L1295)

Normalize a message (UIMessage or ModelMessage) to a UIMessage
Ensures the message has an ID and createdAt timestamp

## Parameters

### message

  \| [`UIMessage`](../interfaces/UIMessage.md)\<`unknown`\>
  \| [`ModelMessage`](../interfaces/ModelMessage.md)\<
  \| `string`
  \| [`ContentPart`](../type-aliases/ContentPart.md)\<`unknown`, `unknown`, `unknown`, `unknown`, `unknown`\>[]
  \| `null`\>

Either a UIMessage or ModelMessage

### generateId

() => `string`

Function to generate a message ID if needed

## Returns

[`UIMessage`](../interfaces/UIMessage.md)

A UIMessage with guaranteed id and createdAt
