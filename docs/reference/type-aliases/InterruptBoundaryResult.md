---
id: InterruptBoundaryResult
title: InterruptBoundaryResult
---

```ts
type InterruptBoundaryResult<TDefinitions> = 
  | undefined
  | {
  interrupts: ReadonlyArray<GenericInterruptRequest<TDefinitions>>;
};
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:171](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L171)

## Type Parameters

### TDefinitions

`TDefinitions` *extends* `AnyInterruptDefinition` = `AnyInterruptDefinition`
