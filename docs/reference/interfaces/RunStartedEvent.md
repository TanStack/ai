---
id: RunStartedEvent
title: RunStartedEvent
---

# Interface: RunStartedEvent

Defined in: [types.ts:764](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L764)

Emitted when a run starts.
This is the first event in any streaming response.

## Extends

- [`BaseAGUIEvent`](BaseAGUIEvent.md)

## Properties

### model?

```ts
optional model: string;
```

Defined in: [types.ts:751](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L751)

Model identifier for multi-model support

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`model`](BaseAGUIEvent.md#model)

***

### rawEvent?

```ts
optional rawEvent: unknown;
```

Defined in: [types.ts:753](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L753)

Original provider event for debugging/advanced use cases

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`rawEvent`](BaseAGUIEvent.md#rawevent)

***

### runId

```ts
runId: string;
```

Defined in: [types.ts:767](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L767)

Unique identifier for this run

***

### threadId?

```ts
optional threadId: string;
```

Defined in: [types.ts:769](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L769)

Optional thread/conversation ID

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:749](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L749)

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`timestamp`](BaseAGUIEvent.md#timestamp)

***

### type

```ts
type: "RUN_STARTED";
```

Defined in: [types.ts:765](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L765)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)
