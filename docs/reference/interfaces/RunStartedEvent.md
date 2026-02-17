---
id: RunStartedEvent
title: RunStartedEvent
---

# Interface: RunStartedEvent

Defined in: [types.ts:735](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L735)

Emitted when a run starts.
This is the first event in any streaming response.

## Extends

- [`BaseAGUIEvent`](BaseAGUIEvent.md)

## Properties

### model?

```ts
optional model: string;
```

Defined in: [types.ts:722](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L722)

Model identifier for multi-model support

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`model`](BaseAGUIEvent.md#model)

***

### rawEvent?

```ts
optional rawEvent: unknown;
```

Defined in: [types.ts:724](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L724)

Original provider event for debugging/advanced use cases

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`rawEvent`](BaseAGUIEvent.md#rawevent)

***

### runId

```ts
runId: string;
```

Defined in: [types.ts:738](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L738)

Unique identifier for this run

***

### threadId?

```ts
optional threadId: string;
```

Defined in: [types.ts:740](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L740)

Optional thread/conversation ID

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:720](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L720)

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`timestamp`](BaseAGUIEvent.md#timestamp)

***

### type

```ts
type: "RUN_STARTED";
```

Defined in: [types.ts:736](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L736)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)
