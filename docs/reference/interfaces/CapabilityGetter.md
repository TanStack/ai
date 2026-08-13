---
id: CapabilityGetter
title: CapabilityGetter
---

# Interface: CapabilityGetter()\<TValue\>

Defined in: [packages/ai/src/activities/chat/middleware/capabilities.ts:17](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/capabilities.ts#L17)

Reads a capability value off a context. Overloaded so the flag narrows the return.

## Type Parameters

### TValue

`TValue`

## Call Signature

```ts
CapabilityGetter(ctx): TValue;
```

Defined in: [packages/ai/src/activities/chat/middleware/capabilities.ts:18](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/capabilities.ts#L18)

Reads a capability value off a context. Overloaded so the flag narrows the return.

### Parameters

#### ctx

[`CapabilityContext`](CapabilityContext.md)

### Returns

`TValue`

## Call Signature

```ts
CapabilityGetter(ctx, opts): TValue | undefined;
```

Defined in: [packages/ai/src/activities/chat/middleware/capabilities.ts:19](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/capabilities.ts#L19)

Reads a capability value off a context. Overloaded so the flag narrows the return.

### Parameters

#### ctx

[`CapabilityContext`](CapabilityContext.md)

#### opts

##### optional

`true`

### Returns

`TValue` \| `undefined`
