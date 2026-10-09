---
id: GenericInterruptResolution
title: GenericInterruptResolution
---

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:124](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L124)

## Type Parameters

### TDefinition

`TDefinition` *extends* `AnyInterruptDefinition`
