---
id: ToolCallEndEvent
title: ToolCallEndEvent
---

# Interface: ToolCallEndEvent

Defined in: [packages/ai/src/types.ts:1191](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1191)

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

Defined in: [packages/ai/src/types.ts:1202](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1202)

Final parsed input arguments (TanStack AI internal)

***

### model?

```ts
optional model: string;
```

Defined in: [packages/ai/src/types.ts:1193](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1193)

Model identifier for multi-model support

***

### result?

```ts
optional result: 
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[];
```

Defined in: [packages/ai/src/types.ts:1204](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1204)

Tool execution result (TanStack AI internal)

***

### state?

```ts
optional state: ToolOutputState;
```

Defined in: [packages/ai/src/types.ts:1206](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1206)

Tool execution output state (TanStack AI internal)

***

### toolCallName?

```ts
optional toolCallName: string;
```

Defined in: [packages/ai/src/types.ts:1195](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1195)

Name of the tool that completed

***

### ~~toolName?~~

```ts
optional toolName: string;
```

Defined in: [packages/ai/src/types.ts:1200](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1200)

#### Deprecated

Use `toolCallName` instead.
Kept for backward compatibility.
