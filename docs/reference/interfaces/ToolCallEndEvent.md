---
id: ToolCallEndEvent
title: ToolCallEndEvent
---

# Interface: ToolCallEndEvent

Defined in: [packages/typescript/ai/src/types.ts:918](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L918)

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

Defined in: [packages/typescript/ai/src/types.ts:929](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L929)

Final parsed input arguments (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:920](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L920)

Model identifier for multi-model support

***

### result?

```ts
optional result: string;
```

Defined in: [packages/typescript/ai/src/types.ts:931](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L931)

Tool execution result (TanStack AI internal)

***

### toolCallName?

```ts
optional toolCallName: string;
```

Defined in: [packages/typescript/ai/src/types.ts:922](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L922)

Name of the tool that completed

***

### ~~toolName?~~

```ts
optional toolName: string;
```

Defined in: [packages/typescript/ai/src/types.ts:927](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L927)

#### Deprecated

Use `toolCallName` instead.
Kept for backward compatibility.
