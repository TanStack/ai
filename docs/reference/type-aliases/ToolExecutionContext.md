---
id: ToolExecutionContext
title: ToolExecutionContext
---

# Type Alias: ToolExecutionContext\<TContext\>

```ts
type ToolExecutionContext<TContext> = RuntimeContextField<TContext> & object;
```

Defined in: [packages/ai/src/types.ts:531](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L531)

Context passed to tool execute functions, providing capabilities like
emitting custom events during execution.

## Type Declaration

### abortSignal?

```ts
optional abortSignal: AbortSignal;
```

Abort signal for the current chat run. Aborts when the run's
`abortController` fires (or middleware aborts). Long-running tools —
e.g. MCP `callTool` — should forward this to cancel in-flight work.

### emitCustomEvent()

```ts
emitCustomEvent: (eventName, value) => void;
```

Emit a custom event during tool execution.
Events are streamed to the client in real-time as AG-UI CUSTOM events.

#### Parameters

##### eventName

`string`

Name of the custom event

##### value

`Record`\<`string`, `any`\>

Event payload value

#### Returns

`void`

#### Example

```ts
const tool = toolDefinition({ ... }).server(async (args, context) => {
  context?.emitCustomEvent('progress', { step: 1, total: 3 })
  // ... do work ...
  context?.emitCustomEvent('progress', { step: 2, total: 3 })
  // ... do more work ...
  return result
})
```

### toolCallId?

```ts
optional toolCallId: string;
```

The ID of the tool call being executed

## Type Parameters

### TContext

`TContext` = `unknown`
