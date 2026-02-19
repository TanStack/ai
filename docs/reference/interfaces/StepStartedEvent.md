---
id: StepStartedEvent
title: StepStartedEvent
---

# Interface: StepStartedEvent

Defined in: [types.ts:851](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L851)

Emitted when a thinking/reasoning step starts.

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

### stepId

```ts
stepId: string;
```

Defined in: [types.ts:854](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L854)

Unique identifier for this step

***

### stepType?

```ts
optional stepType: string;
```

Defined in: [types.ts:856](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L856)

Type of step (e.g., 'thinking', 'planning')

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
type: "STEP_STARTED";
```

Defined in: [types.ts:852](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L852)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)
