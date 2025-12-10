---
id: StepStartedEvent
title: StepStartedEvent
---

# Interface: StepStartedEvent

Defined in: [types.ts:741](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L741)

Emitted when a reasoning/thinking step starts.

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

### stepId

```ts
stepId: string;
```

Defined in: [types.ts:743](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L743)

***

### stepType

```ts
stepType: "thinking" | "reasoning" | "planning";
```

Defined in: [types.ts:744](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L744)

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
type: "STEP_STARTED";
```

Defined in: [types.ts:742](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L742)

#### Overrides

[`BaseEvent`](BaseEvent.md).[`type`](BaseEvent.md#type)
