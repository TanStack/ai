---
id: ToolCallEndEvent
title: ToolCallEndEvent
---

# Interface: ToolCallEndEvent

Defined in: [packages/ai/src/types.ts:1115](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1115)

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

Defined in: [packages/ai/src/types.ts:1126](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1126)

Final parsed input arguments (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1117](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1117)

Model identifier for multi-model support

***

### result?

```ts
optional result: 
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[];
```

Defined in: [packages/ai/src/types.ts:1128](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1128)

Tool execution result (TanStack AI internal)

***

### state?

```ts
optional state: ToolOutputState;
```

Defined in: [packages/ai/src/types.ts:1130](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1130)

Tool execution output state (TanStack AI internal)

***

### toolCallName?

```ts
optional toolCallName: string;
```

Defined in: [packages/ai/src/types.ts:1119](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1119)

Name of the tool that completed

***

### ~~toolName?~~

```ts
optional toolName: string;
```

Defined in: [packages/ai/src/types.ts:1124](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1124)

#### Deprecated

Use `toolCallName` instead.
Kept for backward compatibility.
