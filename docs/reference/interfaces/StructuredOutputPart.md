---
id: StructuredOutputPart
title: StructuredOutputPart
---

# Interface: StructuredOutputPart\<TData\>

Defined in: [packages/ai/src/types.ts:436](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L436)

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

Defined in: [packages/ai/src/types.ts:442](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L442)

Validated final object — only set when `status === 'complete'`.

***

### errorMessage?

```ts
optional errorMessage: string;
```

Defined in: [packages/ai/src/types.ts:448](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L448)

Populated when `status === 'error'`.

***

### partial?

```ts
optional partial: DeepPartial<TData>;
```

Defined in: [packages/ai/src/types.ts:440](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L440)

Progressive parse of `raw` via parsePartialJSON — populated while streaming and after complete.

***

### raw

```ts
raw: string;
```

Defined in: [packages/ai/src/types.ts:444](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L444)

Accumulating JSON buffer. Source of truth for wire round-trip.

***

### reasoning?

```ts
optional reasoning: string;
```

Defined in: [packages/ai/src/types.ts:446](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L446)

Optional chain-of-thought surfaced by reasoning models alongside the structured output.

***

### status

```ts
status: "error" | "complete" | "streaming";
```

Defined in: [packages/ai/src/types.ts:438](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L438)

***

### type

```ts
type: "structured-output";
```

Defined in: [packages/ai/src/types.ts:437](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L437)
