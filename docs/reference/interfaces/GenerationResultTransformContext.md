---
id: GenerationResultTransformContext
title: GenerationResultTransformContext
---

Defined in: packages/ai/src/activities/middleware/types.ts:112

Stable context handed to each [GenerationResultTransform](../type-aliases/GenerationResultTransform.md).

## Type Parameters

### TContext

`TContext` = `unknown`

## Properties

### middleware

```ts
middleware: GenerationMiddlewareContext<TContext>;
```

Defined in: packages/ai/src/activities/middleware/types.ts:114

The activity call being transformed.
