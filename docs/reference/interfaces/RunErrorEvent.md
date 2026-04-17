---
id: RunErrorEvent
title: RunErrorEvent
---

# Interface: RunErrorEvent

Defined in: [types.ts:797](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L797)

Emitted when an error occurs during a run.

## Extends

- [`BaseAGUIEvent`](BaseAGUIEvent.md)

## Properties

### error

```ts
error: object;
```

Defined in: [types.ts:802](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L802)

Error details

#### code?

```ts
optional code: string;
```

#### message

```ts
message: string;
```

***

### model?

```ts
optional model: string;
```

Defined in: [types.ts:756](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L756)

Model identifier for multi-model support

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`model`](BaseAGUIEvent.md#model)

***

### rawEvent?

```ts
optional rawEvent: unknown;
```

Defined in: [types.ts:758](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L758)

Original provider event for debugging/advanced use cases

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`rawEvent`](BaseAGUIEvent.md#rawevent)

***

### runId?

```ts
optional runId: string;
```

Defined in: [types.ts:800](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L800)

Run identifier (if available)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:754](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L754)

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`timestamp`](BaseAGUIEvent.md#timestamp)

***

### type

```ts
type: "RUN_ERROR";
```

Defined in: [types.ts:798](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L798)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)
