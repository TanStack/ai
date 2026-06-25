---
id: TextMessageContentEvent
title: TextMessageContentEvent
---

# Interface: TextMessageContentEvent

Defined in: [packages/ai/src/types.ts:1033](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1033)

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

Defined in: [packages/ai/src/types.ts:1037](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1037)

Full accumulated content so far (TanStack AI internal, for debugging)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1035](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1035)

Model identifier for multi-model support
