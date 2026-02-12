---
id: uiMessageToModelMessages
title: uiMessageToModelMessages
---

# Function: uiMessageToModelMessages()

```ts
function uiMessageToModelMessages(uiMessage): ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [activities/chat/messages.ts:98](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/messages.ts#L98)

Convert a UIMessage to ModelMessage(s)

Walks the parts array IN ORDER to preserve the interleaving of text,
tool calls, and tool results. This is critical for multi-round tool
flows where the model generates text, calls a tool, gets the result,
then generates more text and calls another tool.

The output preserves the sequential structure:
  text1 → toolCall1 → toolResult1 → text2 → toolCall2 → toolResult2
becomes:
  assistant: {content: "text1", toolCalls: [toolCall1]}
  tool: toolResult1
  assistant: {content: "text2", toolCalls: [toolCall2]}
  tool: toolResult2

## Parameters

### uiMessage

[`UIMessage`](../interfaces/UIMessage.md)

The UIMessage to convert

## Returns

[`ModelMessage`](../interfaces/ModelMessage.md)\<
  \| `string`
  \| [`ContentPart`](../type-aliases/ContentPart.md)\<`unknown`, `unknown`, `unknown`, `unknown`, `unknown`\>[]
  \| `null`\>[]

An array of ModelMessages preserving part ordering
