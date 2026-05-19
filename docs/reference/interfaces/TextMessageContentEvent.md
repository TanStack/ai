---
id: TextMessageContentEvent
title: TextMessageContentEvent
---

# Interface: TextMessageContentEvent

Defined in: [packages/typescript/ai/src/types.ts:949](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L949)

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

Defined in: [packages/typescript/ai/src/types.ts:953](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L953)

Full accumulated content so far (TanStack AI internal, for debugging)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:951](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L951)

Model identifier for multi-model support
