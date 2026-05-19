---
id: StructuredOutputPart
title: StructuredOutputPart
---

# Interface: StructuredOutputPart\<TData\>

Defined in: [packages/typescript/ai/src/types.ts:390](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L390)

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

Defined in: [packages/typescript/ai/src/types.ts:396](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L396)

Validated final object — only set when `status === 'complete'`.

***

### errorMessage?

```ts
optional errorMessage: string;
```

Defined in: [packages/typescript/ai/src/types.ts:402](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L402)

Populated when `status === 'error'`.

***

### partial?

```ts
optional partial: DeepPartial<TData>;
```

Defined in: [packages/typescript/ai/src/types.ts:394](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L394)

Progressive parse of `raw` via parsePartialJSON — populated while streaming and after complete.

***

### raw

```ts
raw: string;
```

Defined in: [packages/typescript/ai/src/types.ts:398](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L398)

Accumulating JSON buffer. Source of truth for wire round-trip.

***

### reasoning?

```ts
optional reasoning: string;
```

Defined in: [packages/typescript/ai/src/types.ts:400](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L400)

Optional chain-of-thought surfaced by reasoning models alongside the structured output.

***

### status

```ts
status: "error" | "streaming" | "complete";
```

Defined in: [packages/typescript/ai/src/types.ts:392](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L392)

***

### type

```ts
type: "structured-output";
```

Defined in: [packages/typescript/ai/src/types.ts:391](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L391)
