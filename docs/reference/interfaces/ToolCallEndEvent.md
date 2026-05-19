---
id: ToolCallEndEvent
title: ToolCallEndEvent
---

# Interface: ToolCallEndEvent

Defined in: [packages/typescript/ai/src/types.ts:1009](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1009)

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

Defined in: [packages/typescript/ai/src/types.ts:1020](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1020)

Final parsed input arguments (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1011](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1011)

Model identifier for multi-model support

***

### result?

```ts
optional result: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1022](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1022)

Tool execution result (TanStack AI internal)

***

### toolCallName?

```ts
optional toolCallName: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1013](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1013)

Name of the tool that completed

***

### ~~toolName?~~

```ts
optional toolName: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1018](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1018)

#### Deprecated

Use `toolCallName` instead.
Kept for backward compatibility.
