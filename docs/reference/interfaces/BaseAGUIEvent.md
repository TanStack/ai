---
id: BaseAGUIEvent
title: BaseAGUIEvent
---

# Interface: BaseAGUIEvent

Defined in: [types.ts:746](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L746)

Base structure for AG-UI events.
Extends AG-UI spec with TanStack AI additions (model field).

## Extended by

- [`RunStartedEvent`](RunStartedEvent.md)
- [`RunFinishedEvent`](RunFinishedEvent.md)
- [`RunErrorEvent`](RunErrorEvent.md)
- [`TextMessageStartEvent`](TextMessageStartEvent.md)
- [`TextMessageContentEvent`](TextMessageContentEvent.md)
- [`TextMessageEndEvent`](TextMessageEndEvent.md)
- [`ToolCallStartEvent`](ToolCallStartEvent.md)
- [`ToolCallArgsEvent`](ToolCallArgsEvent.md)
- [`ToolCallEndEvent`](ToolCallEndEvent.md)
- [`StepStartedEvent`](StepStartedEvent.md)
- [`StepFinishedEvent`](StepFinishedEvent.md)
- [`StateSnapshotEvent`](StateSnapshotEvent.md)
- [`StateDeltaEvent`](StateDeltaEvent.md)
- [`CustomEvent`](CustomEvent.md)

## Properties

### model?

```ts
optional model: string;
```

Defined in: [types.ts:750](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L750)

Model identifier for multi-model support

***

### rawEvent?

```ts
optional rawEvent: unknown;
```

Defined in: [types.ts:752](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L752)

Original provider event for debugging/advanced use cases

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:748](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L748)

***

### type

```ts
type: AGUIEventType;
```

Defined in: [types.ts:747](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L747)
