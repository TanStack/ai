---
id: ToolCallEndEvent
title: ToolCallEndEvent
---

# Interface: ToolCallEndEvent

Defined in: [packages/ai/src/types.ts:1184](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1184)

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

Defined in: [packages/ai/src/types.ts:1195](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1195)

Final parsed input arguments (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1186](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1186)

Model identifier for multi-model support

***

### result?

```ts
optional result: 
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[];
```

Defined in: [packages/ai/src/types.ts:1197](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1197)

Tool execution result (TanStack AI internal)

***

### state?

```ts
optional state: ToolOutputState;
```

Defined in: [packages/ai/src/types.ts:1199](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1199)

Tool execution output state (TanStack AI internal)

***

### toolCallName?

```ts
optional toolCallName: string;
```

Defined in: [packages/ai/src/types.ts:1188](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1188)

Name of the tool that completed

***

### ~~toolName?~~

```ts
optional toolName: string;
```

Defined in: [packages/ai/src/types.ts:1193](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1193)

#### Deprecated

Use `toolCallName` instead.
Kept for backward compatibility.
