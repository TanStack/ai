---
id: Capability
title: Capability
---

# Type Alias: Capability\<TValue, TName\>

```ts
type Capability<TValue, TName> = readonly [CapabilityGetter<TValue>, CapabilityProvider<TValue>] & object;
```

Defined in: [packages/ai/src/activities/chat/middleware/capabilities.ts:36](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/capabilities.ts#L36)

A capability handle. It is BOTH a `[get, provide]` tuple (array-destructurable)
AND the identity used in middleware `requires`/`provides` declarations.

Runtime identity is this object's reference. The `capabilityName` literal is
used for diagnostics and COMPILE-TIME tracking only — capability names MUST be
unique across an app or the type-level coverage check conflates them.

## Type Declaration

### capabilityName

```ts
readonly capabilityName: TName;
```

### has()

```ts
has: (ctx) => boolean;
```

**`Internal`**

Presence check for the post-setup assertion.

#### Parameters

##### ctx

[`CapabilityContext`](../interfaces/CapabilityContext.md)

#### Returns

`boolean`

## Type Parameters

### TValue

`TValue` = `unknown`

### TName

`TName` *extends* `string` = `string`
