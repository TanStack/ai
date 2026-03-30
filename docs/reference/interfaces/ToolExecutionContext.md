---
id: ToolExecutionContext
title: ToolExecutionContext
---

# Interface: ToolExecutionContext

Defined in: [types.ts:353](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L353)

Context passed to tool execute functions, providing capabilities like
emitting custom events during execution.

## Properties

### emitCustomEvent()

```ts
emitCustomEvent: (eventName, value) => void;
```

Defined in: [types.ts:374](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L374)

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

***

### toolCallId?

```ts
optional toolCallId: string;
```

Defined in: [types.ts:355](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L355)

The ID of the tool call being executed
