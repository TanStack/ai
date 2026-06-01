---
id: ToolCallEndEvent
title: ToolCallEndEvent
---

# Interface: ToolCallEndEvent

Defined in: [packages/ai/src/types.ts:1127](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1127)

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

Defined in: [packages/ai/src/types.ts:1138](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1138)

Final parsed input arguments (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1129](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1129)

Model identifier for multi-model support

***

### result?

```ts
optional result: 
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[];
```

Defined in: [packages/ai/src/types.ts:1140](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1140)

Tool execution result (TanStack AI internal)

***

### state?

```ts
optional state: ToolOutputState;
```

Defined in: [packages/ai/src/types.ts:1142](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1142)

Tool execution output state (TanStack AI internal)

***

### toolCallName?

```ts
optional toolCallName: string;
```

Defined in: [packages/ai/src/types.ts:1131](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1131)

Name of the tool that completed

***

### ~~toolName?~~

```ts
optional toolName: string;
```

Defined in: [packages/ai/src/types.ts:1136](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1136)

#### Deprecated

Use `toolCallName` instead.
Kept for backward compatibility.
