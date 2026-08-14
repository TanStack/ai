---
id: ToolCallEndEvent
title: ToolCallEndEvent
---

# Interface: ToolCallEndEvent\<TToolName, TInput, TOutput\>

Defined in: [packages/ai/src/types.ts:1264](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1264)

Emitted when a tool call completes.

@ag-ui/core provides: `toolCallId`
TanStack AI adds: `model?`, `toolCallName?`, `toolName?` (deprecated), `input?`, `output?`, `result?`

Same `Pick` (not `extends`) rationale as [ToolCallStartEvent](ToolCallStartEvent.md).

## Extends

- `Pick`\<`AGUIToolCallEndEvent`, `"toolCallId"` \| `"timestamp"` \| `"rawEvent"`\>

## Type Parameters

### TToolName

`TToolName` *extends* `string` = `string`

Constrained tool name type. Defaults to `string` (untyped).

### TInput

`TInput` = `unknown`

Constrained input arguments type. Defaults to `unknown`.

### TOutput

`TOutput` = `unknown`

Constrained output type from the tool's `outputSchema`. Defaults to `unknown`.

## Properties

### input?

```ts
optional input?: TInput;
```

Defined in: [packages/ai/src/types.ts:1280](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1280)

Final parsed input arguments (TanStack AI internal)

***

### model?

```ts
optional model?: string;
```

Defined in: [packages/ai/src/types.ts:1271](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1271)

Model identifier for multi-model support

***

### output?

```ts
optional output?: TOutput;
```

Defined in: [packages/ai/src/types.ts:1287](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1287)

Tool execution output, validated against the tool's `outputSchema` when
one is declared. Prefer this over parsing `result` when present.
Undefined for tools without execute, client tools pending approval, or
when execution throws.

***

### result?

```ts
optional result?: 
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[];
```

Defined in: [packages/ai/src/types.ts:1289](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1289)

Tool execution result (TanStack AI internal / wire form)

***

### state?

```ts
optional state?: ToolOutputState;
```

Defined in: [packages/ai/src/types.ts:1291](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1291)

Tool execution output state (TanStack AI internal)

***

### toolCallName?

```ts
optional toolCallName?: TToolName;
```

Defined in: [packages/ai/src/types.ts:1273](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1273)

Name of the tool that completed (AG-UI-compatible optional field)

***

### ~~toolName?~~

```ts
optional toolName?: TToolName;
```

Defined in: [packages/ai/src/types.ts:1278](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1278)

#### Deprecated

Use `toolCallName` instead.
Kept for backward compatibility.

***

### type

```ts
type: "TOOL_CALL_END";
```

Defined in: [packages/ai/src/types.ts:1269](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1269)
