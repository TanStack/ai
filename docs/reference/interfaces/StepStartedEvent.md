---
id: StepStartedEvent
title: StepStartedEvent
---

# Interface: StepStartedEvent

Defined in: [types.ts:882](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L882)

Emitted when a thinking/reasoning step starts.

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

### stepId

```ts
stepId: string;
```

Defined in: [types.ts:885](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L885)

Unique identifier for this step

***

### stepType?

```ts
optional stepType: string;
```

Defined in: [types.ts:887](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L887)

Type of step (e.g., 'thinking', 'planning')

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
type: "STEP_STARTED";
```

Defined in: [types.ts:883](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L883)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)
