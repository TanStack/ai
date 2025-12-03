---
title: Chunk Definitions
id: chunk-definitions
---

All streaming responses in TanStack AI consist of a series of **StreamChunks** - discrete JSON objects representing different events during the conversation. These chunks enable real-time updates for content generation, tool calls, errors, and completion signals. 

This document defines the data structures (chunks) that flow between the TanStack AI server and client during streaming chat operations.


## Base Structure

All chunks share a common base structure:

```typescript
interface BaseStreamChunk {
  type: StreamChunkType;
  id: string;          // Unique identifier for the message/response
  model: string;       // Model identifier (e.g., "gpt-4o", "claude-3-5-sonnet")
  timestamp: number;   // Unix timestamp in milliseconds
}
```

### Chunk Types

```typescript
type StreamChunkType =
  | 'content'              // Text content being generated
  | 'thinking'             // Model's reasoning process (when supported)
  | 'tool_call'            // Model calling a tool/function
  | 'tool-input-available' // Tool inputs are ready for client execution
  | 'approval-requested'   // Tool requires user approval
  | 'tool_result'          // Result from tool execution
  | 'done'                 // Stream completion
  | 'error';               // Error occurred
```

## Chunk Definitions

### ContentStreamChunk

Emitted when the model generates text content. Sent incrementally as tokens are generated.

```typescript
interface ContentStreamChunk extends BaseStreamChunk {
  type: 'content';
  delta: string;    // The incremental content token (new text since last chunk)
  content: string;  // Full accumulated content so far
  role?: 'assistant';
}
```

**Example:**
```json
{
  "type": "content",
  "id": "chatcmpl-abc123",
  "model": "gpt-4o",
  "timestamp": 1701234567890,
  "delta": "Hello",
  "content": "Hello",
  "role": "assistant"
}
```

**Usage:**
- Display `delta` for smooth streaming effect
- Use `content` for the complete message so far
- Multiple content chunks will be sent for a single response

---

### ThinkingStreamChunk

Emitted when the model exposes its reasoning process (e.g., Claude with extended thinking, o1 models).

```typescript
interface ThinkingStreamChunk extends BaseStreamChunk {
  type: 'thinking';
  delta?: string;   // The incremental thinking token
  content: string;  // Full accumulated thinking content so far
}
```

**Example:**
```json
{
  "type": "thinking",
  "id": "chatcmpl-abc123",
  "model": "claude-3-5-sonnet",
  "timestamp": 1701234567890,
  "delta": "First, I need to",
  "content": "First, I need to"
}
```

**Usage:**
- Display in a separate "thinking" UI element
- Thinking is excluded from messages sent back to the model
- Not all models support thinking chunks

---

### ToolCallStreamChunk

Emitted when the model decides to call a tool/function.

```typescript
interface ToolCallStreamChunk extends BaseStreamChunk {
  type: 'tool_call';
  toolCall: {
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;  // JSON string (may be partial/incremental)
    };
  };
  index: number;  // Index of this tool call (for parallel calls)
}
```

**Example:**
```json
{
  "type": "tool_call",
  "id": "chatcmpl-abc123",
  "model": "gpt-4o",
  "timestamp": 1701234567890,
  "toolCall": {
    "id": "call_abc123",
    "type": "function",
    "function": {
      "name": "get_weather",
      "arguments": "{\"location\":\"San Francisco\"}"
    }
  },
  "index": 0
}
```

**Usage:**
- Multiple chunks may be sent for a single tool call (streaming arguments)
- `arguments` may be incomplete until all chunks for this tool call are received
- `index` allows multiple parallel tool calls

---

### ToolInputAvailableStreamChunk

Emitted when tool inputs are complete and ready for client-side execution.

```typescript
interface ToolInputAvailableStreamChunk extends BaseStreamChunk {
  type: 'tool-input-available';
  toolCallId: string;  // ID of the tool call
  toolName: string;    // Name of the tool to execute
  input: any;          // Parsed tool arguments (JSON object)
}
```

**Example:**
```json
{
  "type": "tool-input-available",
  "id": "chatcmpl-abc123",
  "model": "gpt-4o",
  "timestamp": 1701234567890,
  "toolCallId": "call_abc123",
  "toolName": "get_weather",
  "input": {
    "location": "San Francisco",
    "unit": "fahrenheit"
  }
}
```

**Usage:**
- Signals that the client should execute the tool
- Only sent for tools without a server-side `execute` function
- Client calls `onToolCall` callback with these parameters

---

### ApprovalRequestedStreamChunk

Emitted when a tool requires user approval before execution.

```typescript
interface ApprovalRequestedStreamChunk extends BaseStreamChunk {
  type: 'approval-requested';
  toolCallId: string;  // ID of the tool call
  toolName: string;    // Name of the tool requiring approval
  input: any;          // Tool arguments for review
  approval: {
    id: string;            // Unique approval request ID
    needsApproval: true;   // Always true
  };
}
```

**Example:**
```json
{
  "type": "approval-requested",
  "id": "chatcmpl-abc123",
  "model": "gpt-4o",
  "timestamp": 1701234567890,
  "toolCallId": "call_abc123",
  "toolName": "send_email",
  "input": {
    "to": "user@example.com",
    "subject": "Hello",
    "body": "Test email"
  },
  "approval": {
    "id": "approval_xyz789",
    "needsApproval": true
  }
}
```

**Usage:**
- Display approval UI to user
- User responds with approval decision via `addToolApprovalResponse()`
- Tool execution pauses until approval is granted or denied

---

### ToolResultStreamChunk

Emitted when a tool execution completes (either server-side or client-side).

```typescript
interface ToolResultStreamChunk extends BaseStreamChunk {
  type: 'tool_result';
  toolCallId: string;  // ID of the tool call that was executed
  content: string;     // Result of the tool execution (JSON stringified)
}
```

**Example:**
```json
{
  "type": "tool_result",
  "id": "chatcmpl-abc123",
  "model": "gpt-4o",
  "timestamp": 1701234567891,
  "toolCallId": "call_abc123",
  "content": "{\"temperature\":72,\"conditions\":\"sunny\"}"
}
```

**Usage:**
- Sent after tool execution completes
- Model uses this result to continue the conversation
- May trigger additional model responses

---

### DoneStreamChunk

Emitted when the stream completes successfully.

```typescript
interface DoneStreamChunk extends BaseStreamChunk {
  type: 'done';
  finishReason: 'stop' | 'length' | 'content_filter' | 'tool_calls' | null;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}
```

**Example:**
```json
{
  "type": "done",
  "id": "chatcmpl-abc123",
  "model": "gpt-4o",
  "timestamp": 1701234567892,
  "finishReason": "stop",
  "usage": {
    "promptTokens": 150,
    "completionTokens": 75,
    "totalTokens": 225
  }
}
```

**Finish Reasons:**
- `stop` - Natural completion
- `length` - Reached max tokens
- `content_filter` - Stopped by content filtering
- `tool_calls` - Stopped to execute tools
- `null` - Unknown or not provided

**Usage:**
- Marks the end of a successful stream
- Clean up streaming state
- Display token usage (if available)

---

### ErrorStreamChunk

Emitted when an error occurs during streaming.

```typescript
interface ErrorStreamChunk extends BaseStreamChunk {
  type: 'error';
  error: {
    message: string;  // Human-readable error message
    code?: string;    // Optional error code
  };
}
```

**Example:**
```json
{
  "type": "error",
  "id": "chatcmpl-abc123",
  "model": "gpt-4o",
  "timestamp": 1701234567893,
  "error": {
    "message": "Rate limit exceeded",
    "code": "rate_limit_exceeded"
  }
}
```

**Common Error Codes:**
- `rate_limit_exceeded` - API rate limit hit
- `invalid_request` - Malformed request
- `authentication_error` - API key issues
- `timeout` - Request timed out
- `server_error` - Internal server error

**Usage:**
- Display error to user
- Stream ends after error chunk
- Retry logic should be implemented client-side

---

## Chunk Ordering and Relationships

### Typical Flow

1. **Content Generation:**
   ```
   ContentStreamChunk (delta: "Hello")
   ContentStreamChunk (delta: " world")
   ContentStreamChunk (delta: "!")
   DoneStreamChunk (finishReason: "stop")
   ```

2. **With Thinking:**
   ```
   ThinkingStreamChunk (delta: "I need to...")
   ThinkingStreamChunk (delta: " check the weather")
   ContentStreamChunk (delta: "Let me check")
   DoneStreamChunk (finishReason: "stop")
   ```

3. **Tool Usage:**
   ```
   ToolCallStreamChunk (name: "get_weather")
   ToolResultStreamChunk (content: "{...}")
   ContentStreamChunk (delta: "The weather is...")
   DoneStreamChunk (finishReason: "stop")
   ```

4. **Client Tool with Approval:**
   ```
   ToolCallStreamChunk (name: "send_email")
   ApprovalRequestedStreamChunk (toolName: "send_email")
   [User approves]
   ToolInputAvailableStreamChunk (toolName: "send_email")
   [Client executes]
   ToolResultStreamChunk (content: "{\"sent\":true}")
   ContentStreamChunk (delta: "Email sent successfully")
   DoneStreamChunk (finishReason: "stop")
   ```

### Multiple Tool Calls

When the model calls multiple tools in parallel:

```
ToolCallStreamChunk (index: 0, name: "get_weather")
ToolCallStreamChunk (index: 1, name: "get_time")
ToolResultStreamChunk (toolCallId: "call_1")
ToolResultStreamChunk (toolCallId: "call_2")
ContentStreamChunk (delta: "Based on the data...")
DoneStreamChunk (finishReason: "stop")
```

---

## TypeScript Union Type

All chunks are represented as a discriminated union:

```typescript
type StreamChunk =
  | ContentStreamChunk
  | ThinkingStreamChunk
  | ToolCallStreamChunk
  | ToolInputAvailableStreamChunk
  | ApprovalRequestedStreamChunk
  | ToolResultStreamChunk
  | DoneStreamChunk
  | ErrorStreamChunk;
```

This enables type-safe handling in TypeScript:

```typescript
function handleChunk(chunk: StreamChunk) {
  switch (chunk.type) {
    case 'content':
      console.log(chunk.delta); // TypeScript knows this is ContentStreamChunk
      break;
    case 'thinking':
      console.log(chunk.content); // TypeScript knows this is ThinkingStreamChunk
      break;
    case 'tool_call':
      console.log(chunk.toolCall.function.name); // TypeScript knows structure
      break;
    // ... other cases
  }
}
```

---

## See Also

- [SSE Protocol](./sse-protocol) - How chunks are transmitted via Server-Sent Events
- [HTTP Stream Protocol](./http-stream-protocol.md) - How chunks are transmitted via HTTP streaming
- [Connection Adapters Guide](../guides/connection-adapters.md) - Client implementation
