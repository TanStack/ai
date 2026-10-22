---
id: CapabilityRegistry
title: CapabilityRegistry
---

Defined in: packages/ai/src/activities/chat/middleware/capabilities.ts:61

Per-request bookkeeping: which capabilities were provided, plus the
duplicate-provide notification. Capability VALUES live in per-capability
WeakMaps (see `createCapability`), not here — this only tracks presence.

## Constructors

### Constructor

```ts
new CapabilityRegistry(): CapabilityRegistry;
```

#### Returns

`CapabilityRegistry`

## Methods

### has()

```ts
has(handle): boolean;
```

Defined in: packages/ai/src/activities/chat/middleware/capabilities.ts:76

#### Parameters

##### handle

[`CapabilityHandle`](../type-aliases/CapabilityHandle.md)

#### Returns

`boolean`

***

### markProvided()

```ts
markProvided(handle): void;
```

Defined in: packages/ai/src/activities/chat/middleware/capabilities.ts:71

Record that `handle` was provided; fire the duplicate callback on repeats.

#### Parameters

##### handle

[`CapabilityHandle`](../type-aliases/CapabilityHandle.md)

#### Returns

`void`

***

### setOnDuplicate()

```ts
setOnDuplicate(cb): void;
```

Defined in: packages/ai/src/activities/chat/middleware/capabilities.ts:66

Register a callback fired when a handle is provided more than once.

#### Parameters

##### cb

(`name`) => `void`

#### Returns

`void`
