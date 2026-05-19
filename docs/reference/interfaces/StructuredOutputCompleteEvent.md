---
id: StructuredOutputCompleteEvent
title: StructuredOutputCompleteEvent
---

# Interface: StructuredOutputCompleteEvent\<T\>

Defined in: [packages/typescript/ai/src/types.ts:1149](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1149)

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

- `Omit`\<[`CustomEvent`](CustomEvent.md), `"name"` \| `"value"`\>

## Type Parameters

### T

`T` = `unknown`

## Indexable

```ts
[key: string]: unknown
```

```ts
[key: number]: unknown
```

## Properties

### name

```ts
name: "structured-output.complete";
```

Defined in: [packages/typescript/ai/src/types.ts:1153](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1153)

***

### value

```ts
value: object;
```

Defined in: [packages/typescript/ai/src/types.ts:1154](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1154)

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
optional reasoning: string;
```
