---
id: StepStartedEvent
title: StepStartedEvent
---

# Interface: StepStartedEvent

Defined in: [types.ts:879](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L879)

Emitted when a thinking/reasoning step starts.

## Extends

- [`BaseAGUIEvent`](BaseAGUIEvent.md)

## Properties

### model?

```ts
optional model: string;
```

Defined in: [types.ts:750](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L750)

Model identifier for multi-model support

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`model`](BaseAGUIEvent.md#model)

***

### rawEvent?

```ts
optional rawEvent: unknown;
```

Defined in: [types.ts:752](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L752)

Original provider event for debugging/advanced use cases

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`rawEvent`](BaseAGUIEvent.md#rawevent)

***

### stepId

```ts
stepId: string;
```

Defined in: [types.ts:882](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L882)

Unique identifier for this step

***

### stepType?

```ts
optional stepType: string;
```

Defined in: [types.ts:884](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L884)

Type of step (e.g., 'thinking', 'planning')

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:748](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L748)

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`timestamp`](BaseAGUIEvent.md#timestamp)

***

### type

```ts
type: "STEP_STARTED";
```

Defined in: [types.ts:880](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L880)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)
