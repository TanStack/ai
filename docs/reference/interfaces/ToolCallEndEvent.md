---
id: ToolCallEndEvent
title: ToolCallEndEvent
---

# Interface: ToolCallEndEvent

Defined in: [packages/ai/src/types.ts:1216](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1216)

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

Defined in: [packages/ai/src/types.ts:1227](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1227)

Final parsed input arguments (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1218](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1218)

Model identifier for multi-model support

***

### result?

```ts
optional result: 
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[];
```

Defined in: [packages/ai/src/types.ts:1229](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1229)

Tool execution result (TanStack AI internal)

***

### state?

```ts
optional state: ToolOutputState;
```

Defined in: [packages/ai/src/types.ts:1231](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1231)

Tool execution output state (TanStack AI internal)

***

### toolCallName?

```ts
optional toolCallName: string;
```

Defined in: [packages/ai/src/types.ts:1220](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1220)

Name of the tool that completed

***

### ~~toolName?~~

```ts
optional toolName: string;
```

Defined in: [packages/ai/src/types.ts:1225](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1225)

#### Deprecated

Use `toolCallName` instead.
Kept for backward compatibility.
