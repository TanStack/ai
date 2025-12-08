---
id: BaseEvent
title: BaseEvent
---

# Interface: BaseEvent

Defined in: [types.ts:553](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L553)

Base structure for all AG-UI events.
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

Defined in: [types.ts:557](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L557)

TanStack AI addition: Model identifier for multi-model support

***

### rawEvent?

```ts
optional rawEvent: unknown;
```

Defined in: [types.ts:559](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L559)

Original provider event for debugging/advanced use cases

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:555](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L555)

***

### type

```ts
type: EventType;
```

Defined in: [types.ts:554](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L554)
