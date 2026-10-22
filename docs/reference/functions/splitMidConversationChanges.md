---
id: splitMidConversationChanges
title: splitMidConversationChanges
---

```ts
function splitMidConversationChanges<TTool, TPrompt>(input): 
  | MidConversationRequest<TTool, TPrompt>
  | undefined;
```

Defined in: packages/ai/src/utilities/mid-conversation.ts:129

For adapters: resolve the names and counts of `changes` against the current
`tools` and `systemPrompts`. Returns `undefined` when a name is missing, a
name is used twice, or the counts do not add up. Then the adapter sends the
request it sends today.

## Type Parameters

### TTool

`TTool` *extends* `object`

### TPrompt

`TPrompt`

## Parameters

### input

#### changes

[`MidConversationChanges`](../interfaces/MidConversationChanges.md)

#### systemPrompts

readonly `TPrompt`[]

#### tools

readonly `TTool`[]

## Returns

  \| [`MidConversationRequest`](../interfaces/MidConversationRequest.md)\<`TTool`, `TPrompt`\>
  \| `undefined`
