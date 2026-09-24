---
id: StructuredOutputPart
title: StructuredOutputPart
---

Defined in: [packages/ai/src/types.ts:462](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L462)

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

Defined in: [packages/ai/src/types.ts:468](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L468)

Validated final object — only set when `status === 'complete'`.

***

### errorMessage?

```ts
optional errorMessage?: string;
```

Defined in: [packages/ai/src/types.ts:474](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L474)

Populated when `status === 'error'`.

***

### partial?

```ts
optional partial?: DeepPartial<TData>;
```

Defined in: [packages/ai/src/types.ts:466](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L466)

Progressive parse of `raw` via parsePartialJSON — populated while streaming and after complete.

***

### raw

```ts
raw: string;
```

Defined in: [packages/ai/src/types.ts:470](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L470)

Accumulating JSON buffer. Source of truth for wire round-trip.

***

### reasoning?

```ts
optional reasoning?: string;
```

Defined in: [packages/ai/src/types.ts:472](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L472)

Optional chain-of-thought surfaced by reasoning models alongside the structured output.

***

### status

```ts
status: "error" | "complete" | "streaming";
```

Defined in: [packages/ai/src/types.ts:464](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L464)

***

### type

```ts
type: "structured-output";
```

Defined in: [packages/ai/src/types.ts:463](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L463)
