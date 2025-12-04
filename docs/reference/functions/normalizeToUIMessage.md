---
id: normalizeToUIMessage
title: normalizeToUIMessage
---

# Function: normalizeToUIMessage()

```ts
function normalizeToUIMessage(message, generateId): UIMessage;
```

Defined in: [message-converters.ts:260](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/message-converters.ts#L260)

Normalize a message (UIMessage or ModelMessage) to a UIMessage
Ensures the message has an ID and createdAt timestamp

## Parameters

### message

Either a UIMessage or ModelMessage

[`UIMessage`](../../interfaces/UIMessage) | [`ModelMessage`](../../interfaces/ModelMessage)\<
\| `string`
\| [`ContentPart`](../../type-aliases/ContentPart)\<`unknown`, `unknown`, `unknown`, `unknown`\>[]
\| `null`\>

### generateId

() => `string`

Function to generate a message ID if needed

## Returns

[`UIMessage`](../../interfaces/UIMessage)

A UIMessage with guaranteed id and createdAt
