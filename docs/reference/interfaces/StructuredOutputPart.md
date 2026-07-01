---
id: StructuredOutputPart
title: StructuredOutputPart
---

# Interface: StructuredOutputPart\<TData\>

Defined in: [packages/ai/src/types.ts:405](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L405)

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
optional data: TData;
```

Defined in: [packages/ai/src/types.ts:411](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L411)

Validated final object — only set when `status === 'complete'`.

***

### errorMessage?

```ts
optional errorMessage: string;
```

Defined in: [packages/ai/src/types.ts:417](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L417)

Populated when `status === 'error'`.

***

### partial?

```ts
optional partial: DeepPartial<TData>;
```

Defined in: [packages/ai/src/types.ts:409](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L409)

Progressive parse of `raw` via parsePartialJSON — populated while streaming and after complete.

***

### raw

```ts
raw: string;
```

Defined in: [packages/ai/src/types.ts:413](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L413)

Accumulating JSON buffer. Source of truth for wire round-trip.

***

### reasoning?

```ts
optional reasoning: string;
```

Defined in: [packages/ai/src/types.ts:415](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L415)

Optional chain-of-thought surfaced by reasoning models alongside the structured output.

***

### status

```ts
status: "error" | "complete" | "streaming";
```

Defined in: [packages/ai/src/types.ts:407](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L407)

***

### type

```ts
type: "structured-output";
```

Defined in: [packages/ai/src/types.ts:406](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L406)
