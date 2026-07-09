---
id: TextMessageContentEvent
title: TextMessageContentEvent
---

# Interface: TextMessageContentEvent

Defined in: [packages/ai/src/types.ts:1131](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1131)

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

Defined in: [packages/ai/src/types.ts:1135](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1135)

Full accumulated content so far (TanStack AI internal, for debugging)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1133](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1133)

Model identifier for multi-model support
