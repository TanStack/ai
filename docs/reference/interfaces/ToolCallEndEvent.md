---
id: ToolCallEndEvent
title: ToolCallEndEvent
---

# Interface: ToolCallEndEvent

Defined in: [packages/typescript/ai/src/types.ts:1028](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1028)

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

Defined in: [packages/typescript/ai/src/types.ts:1039](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1039)

Final parsed input arguments (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1030](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1030)

Model identifier for multi-model support

***

### result?

```ts
optional result: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1041](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1041)

Tool execution result (TanStack AI internal)

***

### toolCallName?

```ts
optional toolCallName: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1032](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1032)

Name of the tool that completed

***

### ~~toolName?~~

```ts
optional toolName: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1037](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1037)

#### Deprecated

Use `toolCallName` instead.
Kept for backward compatibility.
