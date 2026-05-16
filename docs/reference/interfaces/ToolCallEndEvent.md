---
id: ToolCallEndEvent
title: ToolCallEndEvent
---

# Interface: ToolCallEndEvent

Defined in: [packages/typescript/ai/src/types.ts:969](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L969)

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

Defined in: [packages/typescript/ai/src/types.ts:980](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L980)

Final parsed input arguments (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:971](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L971)

Model identifier for multi-model support

***

### result?

```ts
optional result: string;
```

Defined in: [packages/typescript/ai/src/types.ts:982](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L982)

Tool execution result (TanStack AI internal)

***

### toolCallName?

```ts
optional toolCallName: string;
```

Defined in: [packages/typescript/ai/src/types.ts:973](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L973)

Name of the tool that completed

***

### ~~toolName?~~

```ts
optional toolName: string;
```

Defined in: [packages/typescript/ai/src/types.ts:978](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L978)

#### Deprecated

Use `toolCallName` instead.
Kept for backward compatibility.
