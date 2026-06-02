---
id: ToolCallEndEvent
title: ToolCallEndEvent
---

# Interface: ToolCallEndEvent

Defined in: [packages/ai/src/types.ts:1121](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1121)

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

Defined in: [packages/ai/src/types.ts:1132](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1132)

Final parsed input arguments (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1123](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1123)

Model identifier for multi-model support

***

### result?

```ts
optional result: 
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[];
```

Defined in: [packages/ai/src/types.ts:1134](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1134)

Tool execution result (TanStack AI internal)

***

### state?

```ts
optional state: ToolOutputState;
```

Defined in: [packages/ai/src/types.ts:1136](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1136)

Tool execution output state (TanStack AI internal)

***

### toolCallName?

```ts
optional toolCallName: string;
```

Defined in: [packages/ai/src/types.ts:1125](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1125)

Name of the tool that completed

***

### ~~toolName?~~

```ts
optional toolName: string;
```

Defined in: [packages/ai/src/types.ts:1130](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1130)

#### Deprecated

Use `toolCallName` instead.
Kept for backward compatibility.
