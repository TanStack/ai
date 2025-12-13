---
id: RunStartedEvent
title: RunStartedEvent
---

# Interface: RunStartedEvent

Defined in: [types.ts:637](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L637)

Emitted when a run starts.

## Extends

- [`BaseEvent`](BaseEvent.md)

## Properties

### model?

```ts
optional model: string;
```

Defined in: [types.ts:629](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L629)

TanStack AI addition: Model identifier for multi-model support

#### Inherited from

[`BaseEvent`](BaseEvent.md).[`model`](BaseEvent.md#model)

***

### rawEvent?

```ts
optional rawEvent: unknown;
```

Defined in: [types.ts:631](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L631)

Original provider event for debugging/advanced use cases

#### Inherited from

[`BaseEvent`](BaseEvent.md).[`rawEvent`](BaseEvent.md#rawevent)

***

### runId

```ts
runId: string;
```

Defined in: [types.ts:639](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L639)

***

### threadId?

```ts
optional threadId: string;
```

Defined in: [types.ts:640](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L640)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:627](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L627)

#### Inherited from

[`BaseEvent`](BaseEvent.md).[`timestamp`](BaseEvent.md#timestamp)

***

### type

```ts
type: "RUN_STARTED";
```

Defined in: [types.ts:638](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L638)

#### Overrides

[`BaseEvent`](BaseEvent.md).[`type`](BaseEvent.md#type)
