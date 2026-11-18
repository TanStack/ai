---
id: GenerationResultTransformContext
title: GenerationResultTransformContext
---

Defined in: [packages/ai/src/activities/middleware/types.ts:118](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L118)

Stable context handed to each [GenerationResultTransform](../type-aliases/GenerationResultTransform.md).

## Type Parameters

### TContext

`TContext` = `unknown`

## Properties

### middleware

```ts
middleware: GenerationMiddlewareContext<TContext>;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:120](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L120)

The activity call being transformed.
