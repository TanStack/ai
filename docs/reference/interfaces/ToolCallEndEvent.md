---
id: ToolCallEndEvent
title: ToolCallEndEvent
---

# Interface: ToolCallEndEvent

Defined in: [packages/ai/src/types.ts:1086](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1086)

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

Defined in: [packages/ai/src/types.ts:1097](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1097)

Final parsed input arguments (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1088](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1088)

Model identifier for multi-model support

***

### result?

```ts
optional result: 
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[];
```

Defined in: [packages/ai/src/types.ts:1099](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1099)

Tool execution result (TanStack AI internal)

***

### state?

```ts
optional state: ToolOutputState;
```

Defined in: [packages/ai/src/types.ts:1101](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1101)

Tool execution output state (TanStack AI internal)

***

### toolCallName?

```ts
optional toolCallName: string;
```

Defined in: [packages/ai/src/types.ts:1090](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1090)

Name of the tool that completed

***

### ~~toolName?~~

```ts
optional toolName: string;
```

Defined in: [packages/ai/src/types.ts:1095](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1095)

#### Deprecated

Use `toolCallName` instead.
Kept for backward compatibility.
