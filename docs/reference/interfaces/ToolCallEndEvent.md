---
id: ToolCallEndEvent
title: ToolCallEndEvent
---

# Interface: ToolCallEndEvent

Defined in: [packages/typescript/ai/src/types.ts:930](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L930)

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

Defined in: [packages/typescript/ai/src/types.ts:941](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L941)

Final parsed input arguments (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:932](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L932)

Model identifier for multi-model support

***

### result?

```ts
optional result: string;
```

Defined in: [packages/typescript/ai/src/types.ts:943](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L943)

Tool execution result (TanStack AI internal)

***

### toolCallName?

```ts
optional toolCallName: string;
```

Defined in: [packages/typescript/ai/src/types.ts:934](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L934)

Name of the tool that completed

***

### ~~toolName?~~

```ts
optional toolName: string;
```

Defined in: [packages/typescript/ai/src/types.ts:939](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L939)

#### Deprecated

Use `toolCallName` instead.
Kept for backward compatibility.
