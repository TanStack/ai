---
id: RunErrorEvent
title: RunErrorEvent
---

# Interface: RunErrorEvent

Defined in: [types.ts:731](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L731)

Emitted when an error occurs during a run.

## Extends

- [`BaseAGUIEvent`](BaseAGUIEvent.md)

## Properties

### error

```ts
error: object;
```

Defined in: [types.ts:736](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L736)

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

Defined in: [types.ts:690](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L690)

Model identifier for multi-model support

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`model`](BaseAGUIEvent.md#model)

***

### rawEvent?

```ts
optional rawEvent: unknown;
```

Defined in: [types.ts:692](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L692)

Original provider event for debugging/advanced use cases

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`rawEvent`](BaseAGUIEvent.md#rawevent)

***

### runId?

```ts
optional runId: string;
```

Defined in: [types.ts:734](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L734)

Run identifier (if available)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:688](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L688)

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`timestamp`](BaseAGUIEvent.md#timestamp)

***

### type

```ts
type: "RUN_ERROR";
```

Defined in: [types.ts:732](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L732)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)
