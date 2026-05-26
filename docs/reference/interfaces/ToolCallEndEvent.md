---
id: ToolCallEndEvent
title: ToolCallEndEvent
---

# Interface: ToolCallEndEvent

Defined in: [packages/ai/src/types.ts:1045](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1045)

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

Defined in: [packages/ai/src/types.ts:1056](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1056)

Final parsed input arguments (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1047](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1047)

Model identifier for multi-model support

***

### result?

```ts
optional result: string;
```

Defined in: [packages/ai/src/types.ts:1058](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1058)

Tool execution result (TanStack AI internal)

***

### toolCallName?

```ts
optional toolCallName: string;
```

Defined in: [packages/ai/src/types.ts:1049](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1049)

Name of the tool that completed

***

### ~~toolName?~~

```ts
optional toolName: string;
```

Defined in: [packages/ai/src/types.ts:1054](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1054)

#### Deprecated

Use `toolCallName` instead.
Kept for backward compatibility.
