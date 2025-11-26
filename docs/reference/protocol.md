# Stream Protocol

This document describes the structure of chunks sent from `@tanstack/ai` to `@tanstack/ai-client`, regardless of the transport mechanism (SSE, HTTP stream, direct stream, etc.).

## Overview

The protocol is based on a stream of JSON objects, where each object represents a chunk of data. All chunks share a common base structure and are distinguished by their `type` field.

## Base Structure

All chunks extend a base structure with the following required fields:

```typescript
interface BaseStreamChunk {
  type: StreamChunkType;
  id: string; // Unique identifier for this chunk
  model: string; // Model name that generated this chunk
  timestamp: number; // Unix timestamp in milliseconds
}
```

## Chunk Types

### 1. Content Chunk

Represents incremental text content from the AI model.

```typescript
interface ContentStreamChunk extends BaseStreamChunk {
  type: "content";
  delta?: string; // The incremental content token (preferred)
  content: string; // Full accumulated content so far
  role?: "assistant";
}
```

**Example:**

```json
{
  "type": "content",
  "id": "chunk_abc123",
  "model": "gpt-4",
  "timestamp": 1699123456789,
  "delta": "Hello",
  "content": "Hello",
  "role": "assistant"
}
```

**Notes:**

- `delta` is preferred over `content` for incremental updates
- `content` represents the full accumulated text up to this point
- The client should prefer `delta` when both are present

### 2. Tool Call Chunk

Represents incremental tool call arguments being streamed.

```typescript
interface ToolCallStreamChunk extends BaseStreamChunk {
  type: "tool_call";
  toolCall: {
    id: string; // Unique identifier for this tool call
    type: "function";
    function: {
      name: string; // Name of the function/tool
      arguments: string; // Incremental JSON arguments (may be incomplete)
    };
  };
  index: number; // Zero-based index of this tool call in the current response
}
```

**Example:**

```json
{
  "type": "tool_call",
  "id": "chunk_def456",
  "model": "gpt-4",
  "timestamp": 1699123456790,
  "toolCall": {
    "id": "call_xyz789",
    "type": "function",
    "function": {
      "name": "get_weather",
      "arguments": "{\"location\": \"San"
    }
  },
  "index": 0
}
```

**Notes:**

- `arguments` is a JSON string that may be incomplete (partial JSON)
- Multiple chunks may be sent for the same tool call as arguments are streamed
- The client should accumulate and parse the arguments incrementally

### 3. Tool Result Chunk

Represents the result of a tool execution.

```typescript
interface ToolResultStreamChunk extends BaseStreamChunk {
  type: "tool_result";
  toolCallId: string; // ID of the tool call this result belongs to
  content: string; // Result content (typically JSON stringified)
}
```

**Example:**

```json
{
  "type": "tool_result",
  "id": "chunk_ghi012",
  "model": "gpt-4",
  "timestamp": 1699123456791,
  "toolCallId": "call_xyz789",
  "content": "{\"temperature\": 72, \"condition\": \"sunny\"}"
}
```

### 4. Done Chunk

Indicates the stream has completed.

```typescript
interface DoneStreamChunk extends BaseStreamChunk {
  type: "done";
  finishReason: "stop" | "length" | "content_filter" | "tool_calls" | null;
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
  "id": "chunk_jkl345",
  "model": "gpt-4",
  "timestamp": 1699123456792,
  "finishReason": "stop",
  "usage": {
    "promptTokens": 150,
    "completionTokens": 75,
    "totalTokens": 225
  }
}
```

**Notes:**

- `finishReason: "tool_calls"` indicates the model wants to make tool calls
- `finishReason: "stop"` indicates normal completion
- `finishReason: "length"` indicates the response was truncated due to token limits
- `usage` is optional and may not be present in all cases

### 5. Error Chunk

Indicates an error occurred during streaming.

```typescript
interface ErrorStreamChunk extends BaseStreamChunk {
  type: "error";
  error: {
    message: string;
    code?: string;
  };
}
```

**Example:**

```json
{
  "type": "error",
  "id": "chunk_mno678",
  "model": "gpt-4",
  "timestamp": 1699123456793,
  "error": {
    "message": "Rate limit exceeded",
    "code": "rate_limit_exceeded"
  }
}
```

**Notes:**

- When an error chunk is received, the stream should be considered terminated
- The client should handle the error and stop processing further chunks

### 6. Approval Requested Chunk

Indicates a tool call requires user approval before execution.

```typescript
interface ApprovalRequestedStreamChunk extends BaseStreamChunk {
  type: "approval-requested";
  toolCallId: string; // ID of the tool call requiring approval
  toolName: string; // Name of the tool
  input: any; // Parsed input arguments for the tool
  approval: {
    id: string; // Unique approval request ID
    needsApproval: true;
  };
}
```

**Example:**

```json
{
  "type": "approval-requested",
  "id": "chunk_pqr901",
  "model": "gpt-4",
  "timestamp": 1699123456794,
  "toolCallId": "call_xyz789",
  "toolName": "send_email",
  "input": {
    "to": "user@example.com",
    "subject": "Important Update",
    "body": "Your request has been processed."
  },
  "approval": {
    "id": "approval_abc123",
    "needsApproval": true
  }
}
```

**Notes:**

- This chunk is emitted when a tool has `needsApproval: true` in its definition
- The client should pause execution and wait for user approval
- The approval ID is used to respond to the approval request

### 7. Tool Input Available Chunk

Indicates a tool call's input is available for client-side execution.

```typescript
interface ToolInputAvailableStreamChunk extends BaseStreamChunk {
  type: "tool-input-available";
  toolCallId: string; // ID of the tool call
  toolName: string; // Name of the tool
  input: any; // Parsed input arguments for the tool
}
```

**Example:**

```json
{
  "type": "tool-input-available",
  "id": "chunk_stu234",
  "model": "gpt-4",
  "timestamp": 1699123456795,
  "toolCallId": "call_xyz789",
  "toolName": "update_ui",
  "input": {
    "component": "status",
    "value": "completed"
  }
}
```

**Notes:**

- This chunk is emitted for client-side tools (tools without server-side execution)
- The client should execute the tool locally and return the result
- This is separate from approval-requested - a tool can be client-side without requiring approval

### 8. Thinking Chunk

Represents "thinking" or reasoning content from models that support it (e.g., Claude's thinking mode).

```typescript
interface ThinkingStreamChunk extends BaseStreamChunk {
  type: "thinking";
  delta?: string; // The incremental thinking token (preferred)
  content: string; // Full accumulated thinking content so far
}
```

**Example:**

```json
{
  "type": "thinking",
  "id": "chunk_vwx567",
  "model": "claude-3-opus",
  "timestamp": 1699123456796,
  "delta": "Let me",
  "content": "Let me"
}
```

**Notes:**

- Similar to content chunks, `delta` is preferred over `content`
- This represents internal reasoning that may not be shown to the user
- Not all models support thinking chunks

## Complete Type Definition

```typescript
type StreamChunkType =
  | "content"
  | "tool_call"
  | "tool_result"
  | "done"
  | "error"
  | "approval-requested"
  | "tool-input-available"
  | "thinking";

type StreamChunk =
  | ContentStreamChunk
  | ToolCallStreamChunk
  | ToolResultStreamChunk
  | DoneStreamChunk
  | ErrorStreamChunk
  | ApprovalRequestedStreamChunk
  | ToolInputAvailableStreamChunk
  | ThinkingStreamChunk;
```

## Transport Mechanisms

The protocol is transport-agnostic. Chunks can be sent via:

1. **Server-Sent Events (SSE)**: Each chunk is sent as `data: <JSON>\n\n`
2. **HTTP Stream**: Newline-delimited JSON (NDJSON)
3. **Direct Stream**: AsyncIterable of chunk objects

### SSE Format

```
data: {"type":"content","id":"chunk_1","model":"gpt-4","timestamp":1699123456789,"delta":"Hello","content":"Hello"}

data: {"type":"content","id":"chunk_2","model":"gpt-4","timestamp":1699123456790,"delta":" world","content":"Hello world"}

data: [DONE]
```

### NDJSON Format

```
{"type":"content","id":"chunk_1","model":"gpt-4","timestamp":1699123456789,"delta":"Hello","content":"Hello"}
{"type":"content","id":"chunk_2","model":"gpt-4","timestamp":1699123456790,"delta":" world","content":"Hello world"}
```

## Chunk Flow

### Typical Text Response

1. Multiple `content` chunks (with `delta` and `content`)
2. One `done` chunk (with `finishReason: "stop"`)

### Tool Call Flow

1. Multiple `tool_call` chunks (incremental arguments)
2. One `done` chunk (with `finishReason: "tool_calls"`)
3. Either:
   - `approval-requested` chunk (if tool needs approval)
   - `tool-input-available` chunk (if client-side tool)
   - `tool_result` chunk (if server executed)
4. Continue with more content or another tool call cycle

### Error Flow

1. Any number of chunks
2. One `error` chunk
3. Stream terminates

## Client Processing

The `@tanstack/ai-client` package processes these chunks through:

1. **Connection Adapter**: Receives chunks from transport
2. **Stream Parser**: Converts adapter format to processor format (if needed)
3. **Stream Processor**: Accumulates state, tracks tool calls, emits events
4. **Chat Client**: Manages message state and UI updates

The processor handles:

- Accumulating text content from `delta` or `content` fields
- Tracking tool call state (awaiting-input, input-streaming, input-complete)
- Parsing partial JSON arguments incrementally
- Emitting lifecycle events for tool calls
- Managing parallel tool calls

## Best Practices

1. **Always prefer `delta` over `content`** when both are present
2. **Handle partial JSON** in tool call arguments gracefully
3. **Track tool call state** using the `id` field, not the `index`
4. **Handle errors gracefully** - an error chunk terminates the stream
5. **Respect approval flow** - wait for user approval when `approval-requested` is received
6. **Use timestamps** for debugging and ordering chunks if needed

## See Also

- [Chat Client API](/docs/api/ai-client.md) - How to use the client
- [Streaming Guide](/docs/guides/streaming.md) - Streaming patterns and examples
- [Tool Registry](/docs/guides/tool-registry.md) - Tool execution and approval
