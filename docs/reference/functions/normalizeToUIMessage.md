---
id: normalizeToUIMessage
title: normalizeToUIMessage
---

# Function: normalizeToUIMessage()

```ts
function normalizeToUIMessage(message, generateId): UIMessage;
```

Defined in: [activities/chat/messages.ts:413](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/messages.ts#L413)

Normalize a message (UIMessage or ModelMessage) to a UIMessage
Ensures the message has an ID and createdAt timestamp

## Parameters

### message

Either a UIMessage or ModelMessage

[`UIMessage`](../interfaces/UIMessage.md) | [`ModelMessage`](../interfaces/ModelMessage.md)\<
\| `string`
\| [`ContentPart`](../type-aliases/ContentPart.md)\<`unknown`, `unknown`, `unknown`, `unknown`, `unknown`\>[]
\| `null`\>

### generateId

() => `string`

Function to generate a message ID if needed

## Returns

[`UIMessage`](../interfaces/UIMessage.md)

A UIMessage with guaranteed id and createdAt
