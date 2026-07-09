---
id: GenerationResultTransformContext
title: GenerationResultTransformContext
---

# Interface: GenerationResultTransformContext\<TContext\>

Defined in: [packages/ai/src/activities/middleware/types.ts:123](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L123)

## Type Parameters

### TContext

`TContext` = `unknown`

## Properties

### middleware

```ts
middleware: GenerationMiddlewareContext<TContext>;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:125](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L125)

Stable context for the activity call being transformed.
