---
id: InterruptBoundaryResult
title: InterruptBoundaryResult
---

# Type Alias: InterruptBoundaryResult\<TDefinitions\>

```ts
type InterruptBoundaryResult<TDefinitions> = 
  | undefined
  | {
  interrupts: ReadonlyArray<GenericInterruptRequest<TDefinitions>>;
};
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:168](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L168)

## Type Parameters

### TDefinitions

`TDefinitions` *extends* `AnyInterruptDefinition` = `AnyInterruptDefinition`
