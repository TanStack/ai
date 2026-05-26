---
id: ToolCallEndEvent
title: ToolCallEndEvent
---

# Interface: ToolCallEndEvent

Defined in: [packages/typescript/ai/src/types.ts:1029](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1029)

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

Defined in: [packages/typescript/ai/src/types.ts:1040](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1040)

Final parsed input arguments (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1031](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1031)

Model identifier for multi-model support

***

### result?

```ts
optional result: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1042](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1042)

Tool execution result (TanStack AI internal)

***

### toolCallName?

```ts
optional toolCallName: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1033](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1033)

Name of the tool that completed

***

### ~~toolName?~~

```ts
optional toolName: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1038](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1038)

#### Deprecated

Use `toolCallName` instead.
Kept for backward compatibility.
