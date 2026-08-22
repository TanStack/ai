---
id: StructuredOutputCompleteEvent
title: StructuredOutputCompleteEvent
---

# Interface: StructuredOutputCompleteEvent\<T\>

Defined in: [packages/ai/src/types.ts:1371](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1371)

Final event of a streaming structured-output run. Carries the validated
`object` (typed as `T` after the orchestrator runs Standard Schema parsing),
the `raw` JSON text that produced it, and — for thinking/reasoning models —
the accumulated reasoning text. Adapters emit this with `T = unknown`; the
chat orchestrator narrows to the schema's inferred type after validation.

`reasoning` is `undefined` when the model produced none (most non-thinking
models) and when the underlying adapter doesn't expose reasoning streams.

`name` is a string literal so consumers can narrow directly:

```ts
if (chunk.type === 'CUSTOM' && chunk.name === 'structured-output.complete') {
  chunk.value.object // typed as T
}
```

## Extends

- [`CustomEvent`](CustomEvent.md)

## Type Parameters

### T

`T` = `unknown`

## Properties

### metadata?

```ts
optional metadata?: Record<string, any>;
```

Defined in: [packages/ai/src/types.ts:1350](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1350)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`metadata`](CustomEvent.md#metadata)

***

### name

```ts
name: "structured-output.complete";
```

Defined in: [packages/ai/src/types.ts:1374](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1374)

#### Overrides

```ts
CustomEvent.name
```

***

### type

```ts
type: "CUSTOM";
```

Defined in: [packages/ai/src/types.ts:1349](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1349)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`type`](CustomEvent.md#type)

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1375](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1375)

#### object

```ts
object: T;
```

#### raw

```ts
raw: string;
```

#### reasoning?

```ts
optional reasoning?: string;
```

#### Overrides

```ts
CustomEvent.value
```
