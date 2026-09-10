---
id: GenerationResultTransform
title: GenerationResultTransform
---

# Type Alias: GenerationResultTransform\<TResult, TContext\>

```ts
type GenerationResultTransform<TResult, TContext> = (result, ctx) => TResult | undefined | Promise<TResult | undefined>;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:118](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L118)

A transform middleware registers on `ctx.resultTransforms` to rewrite the raw
adapter result before it is returned or streamed. Return a new result to
replace it, or `undefined` to leave it unchanged.

## Type Parameters

### TResult

`TResult` = `unknown`

### TContext

`TContext` = `unknown`

## Parameters

### result

`TResult`

### ctx

[`GenerationResultTransformContext`](../interfaces/GenerationResultTransformContext.md)\<`TContext`\>

## Returns

`TResult` \| `undefined` \| `Promise`\<`TResult` \| `undefined`\>
