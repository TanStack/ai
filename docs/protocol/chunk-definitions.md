---
title: AG-UI Event Definitions
id: chunk-definitions
---

TanStack AI implements the [AG-UI (Agent-User Interaction) Protocol](https://docs.ag-ui.com/introduction), an open, lightweight, event-based protocol that standardizes how AI agents connect to user-facing applications.

All streaming responses in TanStack AI consist of a series of **AG-UI Events** - discrete JSON objects representing different stages of the conversation lifecycle. These events enable real-time updates for content generation, tool calls, thinking/reasoning, and completion signals.

## Base Structure

All AG-UI events share a common base structure:

```typescript
interface BaseAGUIEvent {
  type: AGUIEventType;
  timestamp: number;      // Unix timestamp in milliseconds
  model?: string;         // Model identifier (TanStack AI addition)
  rawEvent?: unknown;     // Original provider event for debugging
}
```

### AG-UI Event Types

```typescript
type AGUIEventType =
  | 'RUN_STARTED'           // Run lifecycle begins
  | 'RUN_FINISHED'          // Run completed successfully
  | 'RUN_ERROR'             // Error occurred
  | 'TEXT_MESSAGE_START'    // Text message begins
  | 'TEXT_MESSAGE_CONTENT'  // Text content streaming
  | 'TEXT_MESSAGE_END'      // Text message completes
  | 'TOOL_CALL_START'       // Tool invocation begins
  | 'TOOL_CALL_ARGS'        // Tool arguments streaming
  | 'TOOL_CALL_END'         // Tool call completes (with result)
  | 'STEP_STARTED'          // Thinking/reasoning step begins
  | 'STEP_FINISHED'         // Thinking/reasoning step completes
  | 'STATE_SNAPSHOT'        // Full state synchronization
  | 'STATE_DELTA'           // Incremental state update
  | 'CUSTOM';               // Custom extensibility events
```

Only AG-UI event types are supported; previous legacy chunk formats are no longer accepted.

## AG-UI Event Definitions

### RUN_STARTED

Emitted when a run begins. This is the first event in any streaming response.

```typescript
interface RunStartedEvent extends BaseAGUIEvent {
  type: 'RUN_STARTED';
  runId: string;           // Unique identifier for this run
  threadId?: string;       // Optional thread/conversation ID
}
```

**Example:**
```json
{
  "type": "RUN_STARTED",
  "runId": "run_abc123",
  "model": "gpt-4o",
  "timestamp": 1701234567890
}
```

---

### RUN_FINISHED

Emitted when a run completes successfully.

```typescript
interface RunFinishedEvent extends BaseAGUIEvent {
  type: 'RUN_FINISHED';
  runId: string;
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
  "type": "RUN_FINISHED",
  "runId": "run_abc123",
  "model": "gpt-4o",
  "timestamp": 1701234567900,
  "finishReason": "stop",
  "usage": {
    "promptTokens": 100,
    "completionTokens": 50,
    "totalTokens": 150
  }
}
```

---

### RUN_ERROR

Emitted when an error occurs during a run.

```typescript
interface RunErrorEvent extends BaseAGUIEvent {
  type: 'RUN_ERROR';
  runId?: string;
  error: {
    message: string;
    code?: string;
  };
}
```

**Example:**
```json
{
  "type": "RUN_ERROR",
  "runId": "run_abc123",
  "model": "gpt-4o",
  "timestamp": 1701234567890,
  "error": {
    "message": "Rate limit exceeded",
    "code": "rate_limit"
  }
}
```

---

### TEXT_MESSAGE_START

Emitted when a text message starts.

```typescript
interface TextMessageStartEvent extends BaseAGUIEvent {
  type: 'TEXT_MESSAGE_START';
  messageId: string;
  role: 'assistant';
}
```

---

### TEXT_MESSAGE_CONTENT

Emitted when text content is generated (streaming tokens).

```typescript
interface TextMessageContentEvent extends BaseAGUIEvent {
  type: 'TEXT_MESSAGE_CONTENT';
  messageId: string;
  delta: string;       // The incremental content token
  content?: string;    // Full accumulated content so far
}
```

**Example:**
```json
{
  "type": "TEXT_MESSAGE_CONTENT",
  "messageId": "msg_abc123",
  "model": "gpt-4o",
  "timestamp": 1701234567890,
  "delta": "Hello",
  "content": "Hello"
}
```

---

### TEXT_MESSAGE_END

Emitted when a text message completes.

```typescript
interface TextMessageEndEvent extends BaseAGUIEvent {
  type: 'TEXT_MESSAGE_END';
  messageId: string;
}
```

---

### TOOL_CALL_START

Emitted when a tool call starts.

```typescript
interface ToolCallStartEvent extends BaseAGUIEvent {
  type: 'TOOL_CALL_START';
  toolCallId: string;
  toolName: string;
  index?: number;      // Index for parallel tool calls
}
```

---

### TOOL_CALL_ARGS

Emitted when tool call arguments are streaming.

```typescript
interface ToolCallArgsEvent extends BaseAGUIEvent {
  type: 'TOOL_CALL_ARGS';
  toolCallId: string;
  delta: string;       // Incremental JSON arguments delta
  args?: string;       // Full accumulated arguments so far
}
```

---

### TOOL_CALL_END

Emitted when a tool call completes.

```typescript
interface ToolCallEndEvent extends BaseAGUIEvent {
  type: 'TOOL_CALL_END';
  toolCallId: string;
  toolName: string;
  input?: unknown;     // Final parsed input arguments
  result?: string;     // Tool execution result (if executed)
}
```

---

### STEP_STARTED

Emitted when a thinking/reasoning step starts.

```typescript
interface StepStartedEvent extends BaseAGUIEvent {
  type: 'STEP_STARTED';
  stepId: string;
  stepType?: string;   // e.g., 'thinking', 'planning'
}
```

---

### STEP_FINISHED

Emitted when a thinking/reasoning step finishes.

```typescript
interface StepFinishedEvent extends BaseAGUIEvent {
  type: 'STEP_FINISHED';
  stepId: string;
  delta?: string;      // Incremental thinking content
  content?: string;    // Full accumulated thinking content
}
```

---

## Chunk Ordering and Relationships

### Typical Flow

1. **Content Generation:**
   ```
   RUN_STARTED
   TEXT_MESSAGE_START
   TEXT_MESSAGE_CONTENT (delta: "Hello")
   TEXT_MESSAGE_CONTENT (delta: " world")
   TEXT_MESSAGE_CONTENT (delta: "!")
   TEXT_MESSAGE_END
   RUN_FINISHED (finishReason: "stop")
   ```

2. **With Thinking:**
   ```
   RUN_STARTED
   STEP_STARTED (stepType: "thinking")
   STEP_FINISHED (delta: "I need to...")
   STEP_FINISHED (delta: " check the weather")
   TEXT_MESSAGE_START
   TEXT_MESSAGE_CONTENT (delta: "Let me check")
   TEXT_MESSAGE_END
   RUN_FINISHED (finishReason: "stop")
   ```

3. **Tool Usage:**
   ```
   RUN_STARTED
   TOOL_CALL_START (name: "get_weather")
   TOOL_CALL_ARGS / TOOL_CALL_END (result: "{...}")
   TEXT_MESSAGE_START
   TEXT_MESSAGE_CONTENT (delta: "The weather is...")
   TEXT_MESSAGE_END
   RUN_FINISHED (finishReason: "stop")
   ```

4. **Client Tool with Approval:**
   ```
   RUN_STARTED
   TOOL_CALL_START (name: "send_email")
   TOOL_CALL_ARGS / TOOL_CALL_END
   CUSTOM (name: "approval-requested")
   [User approves]
   [Client executes]
   TEXT_MESSAGE_START
   TEXT_MESSAGE_CONTENT (delta: "Email sent successfully")
   TEXT_MESSAGE_END
   RUN_FINISHED (finishReason: "stop")
   ```

### Multiple Tool Calls

When the model calls multiple tools in parallel:

```
RUN_STARTED
TOOL_CALL_START (index: 0, name: "get_weather")
TOOL_CALL_START (index: 1, name: "get_time")
TOOL_CALL_END (toolCallId: "call_1", result: "...")
TOOL_CALL_END (toolCallId: "call_2", result: "...")
TEXT_MESSAGE_START
TEXT_MESSAGE_CONTENT (delta: "Based on the data...")
TEXT_MESSAGE_END
RUN_FINISHED (finishReason: "stop")
```

---

## TypeScript Union Type

All chunks are represented as the AG-UI event union (`StreamChunk = AGUIEvent`):

```typescript
type StreamChunk =
  | RunStartedEvent
  | RunFinishedEvent
  | RunErrorEvent
  | TextMessageStartEvent
  | TextMessageContentEvent
  | TextMessageEndEvent
  | ToolCallStartEvent
  | ToolCallArgsEvent
  | ToolCallEndEvent
  | StepStartedEvent
  | StepFinishedEvent
  | StateSnapshotEvent
  | StateDeltaEvent
  | CustomEvent;
```

This enables type-safe handling in TypeScript:

```typescript
function handleChunk(chunk: StreamChunk) {
  switch (chunk.type) {
    case 'TEXT_MESSAGE_CONTENT':
      console.log(chunk.delta);
      break;
    case 'STEP_FINISHED':
      console.log(chunk.content);
      break;
    case 'TOOL_CALL_START':
      console.log(chunk.toolName);
      break;
    // ... other cases
  }
}
```

---

## See Also

- [SSE Protocol](./sse-protocol) - How chunks are transmitted via Server-Sent Events
- [HTTP Stream Protocol](./http-stream-protocol) - How chunks are transmitted via HTTP streaming
- [Connection Adapters Guide](../guides/connection-adapters) - Client implementation
