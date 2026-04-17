---
id: BaseAGUIEvent
title: BaseAGUIEvent
---

# Interface: BaseAGUIEvent

Defined in: [types.ts:752](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L752)

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
- [`MessagesSnapshotEvent`](MessagesSnapshotEvent.md)
- [`StateSnapshotEvent`](StateSnapshotEvent.md)
- [`StateDeltaEvent`](StateDeltaEvent.md)
- [`CustomEvent`](CustomEvent.md)

## Properties

### model?

```ts
optional model: string;
```

Defined in: [types.ts:756](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L756)

Model identifier for multi-model support

***

### rawEvent?

```ts
optional rawEvent: unknown;
```

Defined in: [types.ts:758](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L758)

Original provider event for debugging/advanced use cases

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:754](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L754)

***

### type

```ts
type: AGUIEventType;
```

Defined in: [types.ts:753](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L753)
