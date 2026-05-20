---
id: ToolCallEndEvent
title: ToolCallEndEvent
---

# Interface: ToolCallEndEvent

Defined in: [packages/typescript/ai/src/types.ts:1024](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1024)

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

Defined in: [packages/typescript/ai/src/types.ts:1035](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1035)

Final parsed input arguments (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1026](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1026)

Model identifier for multi-model support

***

### result?

```ts
optional result: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1037](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1037)

Tool execution result (TanStack AI internal)

***

### toolCallName?

```ts
optional toolCallName: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1028](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1028)

Name of the tool that completed

***

### ~~toolName?~~

```ts
optional toolName: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1033](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1033)

#### Deprecated

Use `toolCallName` instead.
Kept for backward compatibility.
