---
id: ToolCallEndEvent
title: ToolCallEndEvent
---

# Interface: ToolCallEndEvent

Defined in: [types.ts:864](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L864)

Emitted when a tool call completes.

## Extends

- [`BaseAGUIEvent`](BaseAGUIEvent.md)

## Properties

### input?

```ts
optional input: unknown;
```

Defined in: [types.ts:871](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L871)

Final parsed input arguments

***

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

### result?

```ts
optional result: string;
```

Defined in: [types.ts:873](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L873)

Tool execution result (if executed)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:748](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L748)

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`timestamp`](BaseAGUIEvent.md#timestamp)

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [types.ts:867](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L867)

Tool call identifier

***

### toolName

```ts
toolName: string;
```

Defined in: [types.ts:869](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L869)

Name of the tool

***

### type

```ts
type: "TOOL_CALL_END";
```

Defined in: [types.ts:865](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L865)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)
