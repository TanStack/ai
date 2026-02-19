---
id: BaseAGUIEvent
title: BaseAGUIEvent
---

# Interface: BaseAGUIEvent

Defined in: [types.ts:718](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L718)

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

Defined in: [types.ts:722](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L722)

Model identifier for multi-model support

***

### rawEvent?

```ts
optional rawEvent: unknown;
```

Defined in: [types.ts:724](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L724)

Original provider event for debugging/advanced use cases

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:720](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L720)

***

### type

```ts
type: AGUIEventType;
```

Defined in: [types.ts:719](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L719)
