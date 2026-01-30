---
id: ToolCallEndEvent
title: ToolCallEndEvent
---

# Interface: ToolCallEndEvent

Defined in: [types.ts:804](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L804)

Emitted when a tool call completes.

## Extends

- [`BaseAGUIEvent`](BaseAGUIEvent.md)

## Properties

### input?

```ts
optional input: unknown;
```

Defined in: [types.ts:811](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L811)

Final parsed input arguments

***

### model?

```ts
optional model: string;
```

Defined in: [types.ts:690](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L690)

Model identifier for multi-model support

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`model`](BaseAGUIEvent.md#model)

***

### rawEvent?

```ts
optional rawEvent: unknown;
```

Defined in: [types.ts:692](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L692)

Original provider event for debugging/advanced use cases

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`rawEvent`](BaseAGUIEvent.md#rawevent)

***

### result?

```ts
optional result: string;
```

Defined in: [types.ts:813](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L813)

Tool execution result (if executed)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:688](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L688)

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`timestamp`](BaseAGUIEvent.md#timestamp)

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [types.ts:807](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L807)

Tool call identifier

***

### toolName

```ts
toolName: string;
```

Defined in: [types.ts:809](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L809)

Name of the tool

***

### type

```ts
type: "TOOL_CALL_END";
```

Defined in: [types.ts:805](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L805)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)
