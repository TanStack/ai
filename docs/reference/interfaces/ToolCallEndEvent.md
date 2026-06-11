---
id: ToolCallEndEvent
title: ToolCallEndEvent
---

# Interface: ToolCallEndEvent

Defined in: [packages/ai/src/types.ts:1092](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1092)

Emitted when a tool call completes.

@ag-ui/core provides: `toolCallId`
TanStack AI adds: `model?`, `toolCallName?`, `toolName?` (deprecated), `input?`, `result?`

## Extends

- `ToolCallEndEvent`

## Indexable

```ts
[k: string]: unknown
```

## Properties

### input?

```ts
optional input: unknown;
```

Defined in: [packages/ai/src/types.ts:1103](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1103)

Final parsed input arguments (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1094](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1094)

Model identifier for multi-model support

***

### result?

```ts
optional result: 
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[];
```

Defined in: [packages/ai/src/types.ts:1105](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1105)

Tool execution result (TanStack AI internal)

***

### state?

```ts
optional state: ToolOutputState;
```

Defined in: [packages/ai/src/types.ts:1107](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1107)

Tool execution output state (TanStack AI internal)

***

### toolCallName?

```ts
optional toolCallName: string;
```

Defined in: [packages/ai/src/types.ts:1096](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1096)

Name of the tool that completed

***

### ~~toolName?~~

```ts
optional toolName: string;
```

Defined in: [packages/ai/src/types.ts:1101](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1101)

#### Deprecated

Use `toolCallName` instead.
Kept for backward compatibility.
