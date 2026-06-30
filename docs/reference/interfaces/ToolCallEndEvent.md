---
id: ToolCallEndEvent
title: ToolCallEndEvent
---

# Interface: ToolCallEndEvent

Defined in: [packages/ai/src/types.ts:1133](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1133)

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

Defined in: [packages/ai/src/types.ts:1144](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1144)

Final parsed input arguments (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1135](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1135)

Model identifier for multi-model support

***

### result?

```ts
optional result: 
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[];
```

Defined in: [packages/ai/src/types.ts:1146](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1146)

Tool execution result (TanStack AI internal)

***

### state?

```ts
optional state: ToolOutputState;
```

Defined in: [packages/ai/src/types.ts:1148](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1148)

Tool execution output state (TanStack AI internal)

***

### toolCallName?

```ts
optional toolCallName: string;
```

Defined in: [packages/ai/src/types.ts:1137](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1137)

Name of the tool that completed

***

### ~~toolName?~~

```ts
optional toolName: string;
```

Defined in: [packages/ai/src/types.ts:1142](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1142)

#### Deprecated

Use `toolCallName` instead.
Kept for backward compatibility.
