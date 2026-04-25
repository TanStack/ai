---
id: TextMessageContentEvent
title: TextMessageContentEvent
---

# Interface: TextMessageContentEvent

Defined in: [packages/typescript/ai/src/types.ts:870](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L870)

Emitted when text content is generated (streaming tokens).

@ag-ui/core provides: `messageId`, `delta`
TanStack AI adds: `model?`, `content?` (accumulated)

## Extends

- `TextMessageContentEvent`

## Indexable

```ts
[k: string]: unknown
```

## Properties

### content?

```ts
optional content: string;
```

Defined in: [packages/typescript/ai/src/types.ts:874](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L874)

Full accumulated content so far (TanStack AI internal, for debugging)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:872](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L872)

Model identifier for multi-model support
