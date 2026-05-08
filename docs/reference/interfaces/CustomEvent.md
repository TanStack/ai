---
id: CustomEvent
title: CustomEvent
---

# Interface: CustomEvent

Defined in: [packages/typescript/ai/src/types.ts:1047](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1047)

Custom event for extensibility.

@ag-ui/core provides: `name`, `value`
TanStack AI adds: `model?`

## Extends

- `CustomEvent`

## Indexable

```ts
[k: string]: unknown
```

## Properties

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1049](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1049)

Model identifier for multi-model support
