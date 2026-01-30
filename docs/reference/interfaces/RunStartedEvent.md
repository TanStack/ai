---
id: RunStartedEvent
title: RunStartedEvent
---

# Interface: RunStartedEvent

Defined in: [types.ts:703](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L703)

Emitted when a run starts.
This is the first event in any streaming response.

## Extends

- [`BaseAGUIEvent`](BaseAGUIEvent.md)

## Properties

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

### runId

```ts
runId: string;
```

Defined in: [types.ts:706](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L706)

Unique identifier for this run

***

### threadId?

```ts
optional threadId: string;
```

Defined in: [types.ts:708](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L708)

Optional thread/conversation ID

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
type: "RUN_STARTED";
```

Defined in: [types.ts:704](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L704)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)
