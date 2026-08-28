---
id: StructuredOutputPart
title: StructuredOutputPart
---

# Interface: StructuredOutputPart\<TData\>

Defined in: [packages/ai/src/types.ts:480](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L480)

StructuredOutputPart — a typed structured response attached to the assistant
message that produced it. Generic over the schema-inferred data type so
consumers can thread `useChat({ outputSchema })`'s schema all the way down
to `messages[i].parts[j].data`. Defaults to `unknown` so untyped consumers
(e.g. internal codepaths that don't know about TSchema) keep working.

## Type Parameters

### TData

`TData` = `unknown`

## Properties

### data?

```ts
optional data?: TData;
```

Defined in: [packages/ai/src/types.ts:486](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L486)

Validated final object — only set when `status === 'complete'`.

***

### errorMessage?

```ts
optional errorMessage?: string;
```

Defined in: [packages/ai/src/types.ts:492](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L492)

Populated when `status === 'error'`.

***

### partial?

```ts
optional partial?: DeepPartial<TData>;
```

Defined in: [packages/ai/src/types.ts:484](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L484)

Progressive parse of `raw` via parsePartialJSON — populated while streaming and after complete.

***

### raw

```ts
raw: string;
```

Defined in: [packages/ai/src/types.ts:488](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L488)

Accumulating JSON buffer. Source of truth for wire round-trip.

***

### reasoning?

```ts
optional reasoning?: string;
```

Defined in: [packages/ai/src/types.ts:490](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L490)

Optional chain-of-thought surfaced by reasoning models alongside the structured output.

***

### status

```ts
status: "error" | "complete" | "streaming";
```

Defined in: [packages/ai/src/types.ts:482](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L482)

***

### type

```ts
type: "structured-output";
```

Defined in: [packages/ai/src/types.ts:481](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L481)
