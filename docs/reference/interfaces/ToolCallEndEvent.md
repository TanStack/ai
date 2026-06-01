---
id: ToolCallEndEvent
title: ToolCallEndEvent
---

# Interface: ToolCallEndEvent

Defined in: [packages/ai/src/types.ts:1074](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1074)

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

Defined in: [packages/ai/src/types.ts:1085](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1085)

Final parsed input arguments (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1076](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1076)

Model identifier for multi-model support

***

### result?

```ts
optional result: string;
```

Defined in: [packages/ai/src/types.ts:1087](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1087)

Tool execution result (TanStack AI internal)

***

### toolCallName?

```ts
optional toolCallName: string;
```

Defined in: [packages/ai/src/types.ts:1078](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1078)

Name of the tool that completed

***

### ~~toolName?~~

```ts
optional toolName: string;
```

Defined in: [packages/ai/src/types.ts:1083](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1083)

#### Deprecated

Use `toolCallName` instead.
Kept for backward compatibility.
