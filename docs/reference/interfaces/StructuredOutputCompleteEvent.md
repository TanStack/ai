---
id: StructuredOutputCompleteEvent
title: StructuredOutputCompleteEvent
---

Defined in: [packages/ai/src/types.ts:1552](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1552)

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

Defined in: [packages/ai/src/types.ts:1531](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1531)

Extra information attached to this event.

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`metadata`](CustomEvent.md#metadata)

***

### name

```ts
name: "structured-output.complete";
```

Defined in: [packages/ai/src/types.ts:1555](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1555)

What this custom event is. Required: without it a consumer cannot route
the value.

#### Overrides

```ts
CustomEvent.name
```

***

### type

```ts
type: "CUSTOM";
```

Defined in: [packages/ai/src/types.ts:1530](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1530)

#### Inherited from

[`CustomEvent`](CustomEvent.md).[`type`](CustomEvent.md#type)

***

### value

```ts
value: object;
```

Defined in: [packages/ai/src/types.ts:1556](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1556)

The payload. Any JSON value, and required.

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
