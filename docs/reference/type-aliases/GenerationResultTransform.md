---
id: GenerationResultTransform
title: GenerationResultTransform
---

# Type Alias: GenerationResultTransform()\<TResult, TContext\>

```ts
type GenerationResultTransform<TResult, TContext> = (result, ctx) => TResult | undefined | Promise<TResult | undefined>;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:128](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L128)

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
