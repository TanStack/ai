---
id: ToolCallEndEvent
title: ToolCallEndEvent
---

# Interface: ToolCallEndEvent

Defined in: [packages/ai/src/types.ts:1153](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1153)

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

Defined in: [packages/ai/src/types.ts:1164](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1164)

Final parsed input arguments (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1155](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1155)

Model identifier for multi-model support

***

### result?

```ts
optional result: 
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[];
```

Defined in: [packages/ai/src/types.ts:1166](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1166)

Tool execution result (TanStack AI internal)

***

### state?

```ts
optional state: ToolOutputState;
```

Defined in: [packages/ai/src/types.ts:1168](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1168)

Tool execution output state (TanStack AI internal)

***

### toolCallName?

```ts
optional toolCallName: string;
```

Defined in: [packages/ai/src/types.ts:1157](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1157)

Name of the tool that completed

***

### ~~toolName?~~

```ts
optional toolName: string;
```

Defined in: [packages/ai/src/types.ts:1162](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1162)

#### Deprecated

Use `toolCallName` instead.
Kept for backward compatibility.
