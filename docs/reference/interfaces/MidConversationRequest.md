---
id: MidConversationRequest
title: MidConversationRequest
---

Defined in: [packages/ai/src/utilities/mid-conversation.ts:114](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/mid-conversation.ts#L114)

## Type Parameters

### TTool

`TTool`

### TPrompt

`TPrompt`

## Properties

### addedTools

```ts
addedTools: TTool[];
```

Defined in: [packages/ai/src/utilities/mid-conversation.ts:118](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/mid-conversation.ts#L118)

Every added tool, in change order.

***

### at

```ts
at: Map<number, {
  systemPrompts: TPrompt[];
  tools: TTool[];
}>;
```

Defined in: [packages/ai/src/utilities/mid-conversation.ts:120](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/mid-conversation.ts#L120)

The changes by message index (`before`).

***

### startSystemPrompts

```ts
startSystemPrompts: TPrompt[];
```

Defined in: [packages/ai/src/utilities/mid-conversation.ts:116](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/mid-conversation.ts#L116)

***

### startTools

```ts
startTools: TTool[];
```

Defined in: [packages/ai/src/utilities/mid-conversation.ts:115](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/mid-conversation.ts#L115)
