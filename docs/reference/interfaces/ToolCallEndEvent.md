---
id: ToolCallEndEvent
title: ToolCallEndEvent
---

# Interface: ToolCallEndEvent

Defined in: [types.ts:867](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L867)

Emitted when a tool call completes.

## Extends

- [`BaseAGUIEvent`](BaseAGUIEvent.md)

## Properties

### input?

```ts
optional input: unknown;
```

Defined in: [types.ts:874](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L874)

Final parsed input arguments

***

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

### result?

```ts
optional result: string;
```

Defined in: [types.ts:876](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L876)

Tool execution result (if executed)

***

### timestamp

```ts
timestamp: number;
```

Defined in: [types.ts:749](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L749)

#### Inherited from

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`timestamp`](BaseAGUIEvent.md#timestamp)

***

### toolCallId

```ts
toolCallId: string;
```

Defined in: [types.ts:870](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L870)

Tool call identifier

***

### toolName

```ts
toolName: string;
```

Defined in: [types.ts:872](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L872)

Name of the tool

***

### type

```ts
type: "TOOL_CALL_END";
```

Defined in: [types.ts:868](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L868)

#### Overrides

[`BaseAGUIEvent`](BaseAGUIEvent.md).[`type`](BaseAGUIEvent.md#type)
