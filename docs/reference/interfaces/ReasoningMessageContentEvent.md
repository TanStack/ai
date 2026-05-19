---
id: ReasoningMessageContentEvent
title: ReasoningMessageContentEvent
---

# Interface: ReasoningMessageContentEvent

Defined in: [packages/typescript/ai/src/types.ts:1281](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1281)

Emitted when reasoning message content is generated.

@ag-ui/core provides: `messageId`, `delta`
TanStack AI adds: `model?`

## Extends

- `ReasoningMessageContentEvent`

## Indexable

```ts
[k: string]: unknown
```

## Properties

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1283](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1283)

Model identifier for multi-model support
