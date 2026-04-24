---
id: ToolCallEndEvent
title: ToolCallEndEvent
---

# Interface: ToolCallEndEvent

Defined in: [packages/typescript/ai/src/types.ts:927](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L927)

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

Defined in: [packages/typescript/ai/src/types.ts:938](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L938)

Final parsed input arguments (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:929](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L929)

Model identifier for multi-model support

***

### result?

```ts
optional result: string;
```

Defined in: [packages/typescript/ai/src/types.ts:940](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L940)

Tool execution result (TanStack AI internal)

***

### toolCallName?

```ts
optional toolCallName: string;
```

Defined in: [packages/typescript/ai/src/types.ts:931](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L931)

Name of the tool that completed

***

### ~~toolName?~~

```ts
optional toolName: string;
```

Defined in: [packages/typescript/ai/src/types.ts:936](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L936)

#### Deprecated

Use `toolCallName` instead.
Kept for backward compatibility.
