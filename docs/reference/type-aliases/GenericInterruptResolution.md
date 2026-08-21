---
id: GenericInterruptResolution
title: GenericInterruptResolution
---

# Type Alias: GenericInterruptResolution\<TDefinition\>

```ts
type GenericInterruptResolution<TDefinition> = TDefinition extends AnyInterruptDefinition ? 
  | {
  request: GenericInterruptRequest<TDefinition>;
  response: InterruptResponse<TDefinition>;
  status: "resolved";
}
  | {
  request: GenericInterruptRequest<TDefinition>;
  response?: never;
  status: "cancelled";
} : never;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:119](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L119)

## Type Parameters

### TDefinition

`TDefinition` *extends* `AnyInterruptDefinition`
