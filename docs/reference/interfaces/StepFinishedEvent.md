---
id: StepFinishedEvent
title: StepFinishedEvent
---

# Interface: StepFinishedEvent

Defined in: [types.ts:678](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L678)

Emitted when a reasoning/thinking step completes or streams content.

## Extends

- [`BaseEvent`](BaseEvent.md)

## Properties

### content

```ts
content: string;
```

Defined in: [types.ts:684](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L684)

Full accumulated thinking content

***

### delta?

```ts
optional delta: string;
```

Defined in: [types.ts:682](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L682)

Incremental thinking token

***

### model?

```ts
optional model: string;
```

Defined in: [types.ts:557](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L557)

TanStack AI addition: Model identifier for multi-model support

#### Inherited from

[`BaseEvent`](BaseEvent.md).[`model`](BaseEvent.md#model)

***

### rawEvent?

```ts
optional rawEvent: unknown;
```

Defined in: [types.ts:559](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L559)

Original provider event for debugging/advanced use cases

#### Inherited from

[`BaseEvent`](BaseEvent.md).[`rawEvent`](BaseEvent.md#rawevent)

***

### stepId

```ts
stepId: string;
```

Defined in: [types.ts:680](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L680)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:555](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L555)

#### Inherited from

[`BaseEvent`](BaseEvent.md).[`timestamp`](BaseEvent.md#timestamp)

***

### type

```ts
type: "STEP_FINISHED";
```

Defined in: [types.ts:679](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L679)

#### Overrides

[`BaseEvent`](BaseEvent.md).[`type`](BaseEvent.md#type)
