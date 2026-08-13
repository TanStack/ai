---
id: CapabilityProvider
title: CapabilityProvider
---

# Type Alias: CapabilityProvider()\<TValue\>

```ts
type CapabilityProvider<TValue> = (ctx, value) => void;
```

Defined in: [packages/ai/src/activities/chat/middleware/capabilities.ts:23](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/capabilities.ts#L23)

Writes a capability value onto a context.

## Type Parameters

### TValue

`TValue`

## Parameters

### ctx

[`CapabilityContext`](../interfaces/CapabilityContext.md)

### value

`TValue`

## Returns

`void`
