---
id: GenerationResultTransformContext
title: GenerationResultTransformContext
---

Defined in: [packages/ai/src/activities/middleware/types.ts:110](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L110)

Stable context handed to each [GenerationResultTransform](../type-aliases/GenerationResultTransform.md).

## Type Parameters

### TContext

`TContext` = `unknown`

## Properties

### middleware

```ts
middleware: GenerationMiddlewareContext<TContext>;
```

Defined in: [packages/ai/src/activities/middleware/types.ts:112](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/middleware/types.ts#L112)

The activity call being transformed.
