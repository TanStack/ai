# Client-Side Tool Execution Fix

## Problem

When client-side tools (tools without an `execute` function) were executed via the `onToolCall` callback, they would create a `tool-call` part but **never create a corresponding `tool-result` part**. This caused the conversation to be incomplete.

### Example of the Bug

Given this conversation:

1. User: "please recommend a good acoustic guitar"
2. Assistant: [calls `getGuitars` (server-side), then `recommendGuitar` (client-side)]
3. User: "why did you choose that?"
4. Assistant: [empty response or confused response]

The assistant couldn't answer because when the conversation was sent back to the LLM, the `recommendGuitar` tool call had **no result**, making it appear incomplete.

### Why This Happened

1. **Server-side tools**: When executed server-side, the `chat` function emits a `tool_result` chunk which creates a `tool-result` part.

2. **Client-side tools**: When executed via `onToolCall` callback, the `addToolResult()` method was called, but it only updated the `tool-call` part's `output` field. It **did not create a separate `tool-result` part**.

3. **Message conversion**: When converting `UIMessage` to `ModelMessage` (for sending back to the LLM), only `tool-result` parts get converted to proper tool result messages with `role: 'tool'`. The `output` field on the `tool-call` part was ignored.

## The Fix

Modified `ChatClient.addToolResult()` in `packages/typescript/ai-client/src/chat-client.ts` to:

1. Find the message containing the tool call
2. **Update the `tool-call` part's `output` field** (for UI rendering - components check `part.output`)
3. **Create a separate `tool-result` part** (for LLM conversation history - sent back to the model)
4. Convert the output to a JSON string for the tool-result content (matching server-side behavior)

### Code Changes

```typescript
async addToolResult(result: {
  toolCallId: string
  tool: string
  output: any
  state?: 'output-available' | 'output-error'
  errorText?: string
}): Promise<void> {
  // ... event emission ...

  // Find the message containing this tool call
  const messageWithToolCall = this.messages.find((msg) =>
    msg.parts.some(
      (p): p is ToolCallPart =>
        p.type === 'tool-call' && p.id === result.toolCallId,
    ),
  )

  // Step 1: Update the tool-call part's output field (for UI rendering)
  let updatedMessages = updateToolCallWithOutput(
    this.messages,
    result.toolCallId,
    result.output,
    result.state === 'output-error' ? 'input-complete' : undefined,
    result.errorText,
  )

  // Step 2: Create a tool-result part (for LLM conversation history)
  const content =
    typeof result.output === 'string'
      ? result.output
      : JSON.stringify(result.output)
  const toolResultState: ToolResultState =
    result.state === 'output-error' ? 'error' : 'complete'

  updatedMessages = updateToolResultPart(
    updatedMessages,
    messageWithToolCall.id,
    result.toolCallId,
    content,
    toolResultState,
    result.errorText,
  )

  this.setMessages(updatedMessages)

  // ... auto-send logic ...
}
```

## How It Works Now

### Why We Need Both

Client-side tool execution now updates the message in **two ways**:

1. **`tool-call.output`** - For UI rendering
   - UI components check `part.type === 'tool-call' && part.output` to render custom UI
   - Example: `<GuitarRecommendation id={part.output.id} />`
   - This is NOT sent to the LLM

2. **`tool-result` part** - For LLM conversation history
   - When converting to `ModelMessage`, `tool-result` parts become messages with `role: 'tool'`
   - This tells the LLM that the tool was executed and what the result was
   - The LLM uses this to provide contextually appropriate follow-up responses

### Complete Flow

1. **Tool Call Arrives**: Server sends `tool_call` chunk for `recommendGuitar` (client-side tool)
2. **Tool Call Part Created**: `onToolCallStateChange` handler creates a `tool-call` part
3. **Tool Execution**: `onToolInputAvailable` handler triggers `onToolCall` callback
4. **Client Executes**: Client-side code returns `{ id: "6" }`
5. **Result Added**: `addToolResult()` does TWO things ✅ (NEW!)
   - Updates `tool-call.output = { id: "6" }` for UI rendering
   - Creates a `tool-result` part with `content: '{"id":"6"}'` for LLM
6. **UI Renders**: Components see `part.output` and display the guitar card
7. **Message Sent Back**: User sends next message
8. **Conversion**: `uiMessageToModelMessages()` converts the `tool-result` part to a `ModelMessage` with `role: 'tool'`
9. **LLM Receives Complete History**: The LLM now sees the tool was executed and can respond appropriately

### Example Output (After Fix)

```json
[
  {
    "id": "_R_ba_-1764551752994-gna6k9",
    "role": "assistant",
    "parts": [
      {
        "type": "tool-call",
        "id": "fc_0c2faf6d38da002d00692cec49be948196a19b1335f1b93647",
        "name": "getGuitars",
        "arguments": "{}",
        "state": "input-complete"
      },
      {
        "type": "tool-result",
        "toolCallId": "fc_0c2faf6d38da002d00692cec49be948196a19b1335f1b93647",
        "content": "[...]",
        "state": "complete"
      },
      {
        "type": "tool-call",
        "id": "fc_08d3756a06aa6ffb00692cec4c18d481969c355bdc77771143",
        "name": "recommendGuitar",
        "arguments": "{\"id\":\"6\"}",
        "state": "input-complete",
        "output": { "id": "6" } // ✅ For UI rendering (GuitarRecommendation component)
      },
      {
        "type": "tool-result", // ✅ For LLM conversation history
        "toolCallId": "fc_08d3756a06aa6ffb00692cec4c18d481969c355bdc77771143",
        "content": "{\"id\":\"6\"}",
        "state": "complete"
      }
    ]
  }
]
```

## Testing

1. Start the testing panel: `cd testing/panel && pnpm dev`
2. Navigate to http://localhost:3011/
3. Ask: "please recommend a good acoustic guitar"
4. Wait for the guitar recommendation to appear
5. Ask: "why did you choose that?"
6. The assistant should now be able to explain its reasoning ✅

You can also inspect the messages in the debugging panel at http://localhost:3011/stream-debugger

## Impact

- ✅ Client-side tool UI rendering works (tool-call.output for components)
- ✅ Client-side tools now behave identically to server-side tools (tool-result parts for LLM)
- ✅ Tool results are properly recorded in conversation history
- ✅ LLMs can see and reference client-side tool executions
- ✅ Follow-up questions about tool results now work correctly
- ✅ No breaking changes - this is a bug fix

## Before vs After

### Before the Fix

- **UI**: ❌ Guitar card not rendering (no `part.output`)
- **LLM**: ❌ Follow-up questions fail (no tool-result part in history)

### After the Fix

- **UI**: ✅ Guitar card renders (has `part.output`)
- **LLM**: ✅ Follow-up questions work (has tool-result part in history)
