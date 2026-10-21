---
id: ToolExecutionContext
title: ToolExecutionContext
---

```ts
type ToolExecutionContext<TContext> = RuntimeContextField<TContext> & object;
```

Defined in: packages/ai/src/types.ts:872

Context passed to tool execute functions, providing capabilities like
emitting custom events during execution.

## Type Declaration

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Abort signal for the current chat run. Aborts when the run's
`abortController` fires (or middleware aborts). Long-running tools —
e.g. MCP `callTool` — should forward this to cancel in-flight work.

### detach?

```ts
optional detach?: (work) => Promise<string>;
```

Set when the host can move this call to the background. Pass it the
work of the call, and race the two promises. It resolves to a short
note for the model when the user moves the call. The work keeps
running, and the host tells the model its result when it ends.
`chat()` does not set it: a host wraps the tool's `execute` to add it.
The note is a string. An object `outputSchema` rejects it. A string
schema, or no schema, accepts it.

#### Parameters

##### work

`Promise`\<`unknown`\>

#### Returns

`Promise`\<`string`\>

#### Example

```ts
const work = runJob(args)
return context?.detach ? Promise.race([work, context.detach(work)]) : work
```

### emitCustomEvent

```ts
emitCustomEvent: (eventName, value, options?) => void;
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

##### options?

[`EmitCustomEventOptions`](../interfaces/EmitCustomEventOptions.md)

Pass `{ batch: true }` to keep this event in the
  durability batch instead of flushing it immediately

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

### inputResponse?

```ts
optional inputResponse?: ToolInputResponse;
```

The answer to the input request that this tool call raised in the
previous run. It is set only when the run resumes an `mcp_input`
interrupt for this tool call.

### threadId?

```ts
optional threadId?: string;
```

The thread id of the chat run. `chat()` sets it to the same value as
`ctx.threadId` in middleware. A tool can use it to keep its own state
for each conversation. It is missing when a tool runs outside a chat,
for example from an MCP server, WebMCP, or a direct `execute()` call.

### toolCallId?

```ts
optional toolCallId?: string;
```

The ID of the tool call being executed

## Type Parameters

### TContext

`TContext` = `unknown`
