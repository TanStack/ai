---
title: AG-UI Event Definitions
id: chunk-definitions
---

TanStack AI implements the [AG-UI (Agent-User Interaction) Protocol](https://docs.ag-ui.com/introduction), an open, lightweight, event-based protocol that standardizes how AI agents connect to user-facing applications.

All streaming responses in TanStack AI consist of a series of **AG-UI Events** - discrete JSON objects representing different stages of the conversation lifecycle. These events enable real-time updates for content generation, tool calls, thinking/reasoning, and completion signals.

## Base Structure

All events share a common base structure:

```typescript
interface BaseEvent {
  type: EventType;
  timestamp: number;      // Unix timestamp in milliseconds
  model?: string;         // Model identifier (TanStack AI addition)
  rawEvent?: unknown;     // Original provider event for debugging
}
```

### Event Types

```typescript
type EventType =
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

## Event Definitions

### RUN_STARTED

Emitted when a run begins. This is the first event in any streaming response.

```typescript
interface RunStartedEvent extends BaseEvent {
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
interface RunFinishedEvent extends BaseEvent {
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

---

### RUN_ERROR

Emitted when an error occurs during a run.

```typescript
interface RunErrorEvent extends BaseEvent {
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
  "timestamp": 1701234567893,
  "error": {
    "message": "Rate limit exceeded",
    "code": "rate_limit_exceeded"
  }
}
```

---

### TEXT_MESSAGE_START

Emitted when a text message begins streaming.

```typescript
interface TextMessageStartEvent extends BaseEvent {
  type: 'TEXT_MESSAGE_START';
  messageId: string;
  role: 'assistant';
}
```

**Example:**
```json
{
  "type": "TEXT_MESSAGE_START",
  "messageId": "msg_xyz789",
  "model": "gpt-4o",
  "timestamp": 1701234567890,
  "role": "assistant"
}
```

---

### TEXT_MESSAGE_CONTENT

Emitted for each chunk of text content as it streams.

```typescript
interface TextMessageContentEvent extends BaseEvent {
  type: 'TEXT_MESSAGE_CONTENT';
  messageId: string;
  delta: string;           // The incremental content token
  content?: string;        // Full accumulated content so far (TanStack AI addition)
}
```

**Example:**
```json
{
  "type": "TEXT_MESSAGE_CONTENT",
  "messageId": "msg_xyz789",
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
interface TextMessageEndEvent extends BaseEvent {
  type: 'TEXT_MESSAGE_END';
  messageId: string;
}
```

**Example:**
```json
{
  "type": "TEXT_MESSAGE_END",
  "messageId": "msg_xyz789",
  "model": "gpt-4o",
  "timestamp": 1701234567891
}
```

---

### TOOL_CALL_START

Emitted when a tool call begins.

```typescript
interface ToolCallStartEvent extends BaseEvent {
  type: 'TOOL_CALL_START';
  toolCallId: string;
  toolName: string;
  index?: number;          // Index for parallel tool calls
  approval?: {             // Present if tool requires approval
    id: string;
    needsApproval: true;
  };
}
```

**Example:**
```json
{
  "type": "TOOL_CALL_START",
  "toolCallId": "call_abc123",
  "toolName": "get_weather",
  "model": "gpt-4o",
  "timestamp": 1701234567890,
  "index": 0
}
```

---

### TOOL_CALL_ARGS

Emitted as tool call arguments stream.

```typescript
interface ToolCallArgsEvent extends BaseEvent {
  type: 'TOOL_CALL_ARGS';
  toolCallId: string;
  delta: string;           // Incremental JSON arguments
  args?: string;           // Full accumulated arguments so far
}
```

**Example:**
```json
{
  "type": "TOOL_CALL_ARGS",
  "toolCallId": "call_abc123",
  "model": "gpt-4o",
  "timestamp": 1701234567890,
  "delta": "{\"location\":",
  "args": "{\"location\":"
}
```

---

### TOOL_CALL_END

Emitted when a tool call completes. May include the result if the tool was executed server-side.

```typescript
interface ToolCallEndEvent extends BaseEvent {
  type: 'TOOL_CALL_END';
  toolCallId: string;
  toolName: string;
  input?: any;             // Final parsed input arguments
  result?: string;         // Tool execution result (if executed)
}
```

**Example (client-side tool):**
```json
{
  "type": "TOOL_CALL_END",
  "toolCallId": "call_abc123",
  "toolName": "get_weather",
  "model": "gpt-4o",
  "timestamp": 1701234567890,
  "input": {
    "location": "San Francisco",
    "unit": "fahrenheit"
  }
}
```

**Example (server-side tool with result):**
```json
{
  "type": "TOOL_CALL_END",
  "toolCallId": "call_abc123",
  "toolName": "get_weather",
  "model": "gpt-4o",
  "timestamp": 1701234567891,
  "input": { "location": "San Francisco" },
  "result": "{\"temperature\":72,\"conditions\":\"sunny\"}"
}
```

---

### STEP_STARTED

Emitted when a thinking/reasoning step begins (e.g., Claude's extended thinking, o1 models).

```typescript
interface StepStartedEvent extends BaseEvent {
  type: 'STEP_STARTED';
  stepId: string;
  stepType: 'thinking' | 'reasoning' | 'planning';
}
```

**Example:**
```json
{
  "type": "STEP_STARTED",
  "stepId": "step_xyz123",
  "stepType": "thinking",
  "model": "claude-3-5-sonnet",
  "timestamp": 1701234567890
}
```

---

### STEP_FINISHED

Emitted when thinking/reasoning content streams or completes.

```typescript
interface StepFinishedEvent extends BaseEvent {
  type: 'STEP_FINISHED';
  stepId: string;
  delta?: string;          // Incremental thinking token
  content: string;         // Full accumulated thinking content
}
```

**Example:**
```json
{
  "type": "STEP_FINISHED",
  "stepId": "step_xyz123",
  "model": "claude-3-5-sonnet",
  "timestamp": 1701234567890,
  "delta": "Let me analyze",
  "content": "Let me analyze"
}
```

---

### STATE_SNAPSHOT

Emitted for full state synchronization (shared state between agent and app).

```typescript
interface StateSnapshotEvent extends BaseEvent {
  type: 'STATE_SNAPSHOT';
  state: Record<string, unknown>;
}
```

**Example:**
```json
{
  "type": "STATE_SNAPSHOT",
  "timestamp": 1701234567890,
  "state": {
    "currentStep": 3,
    "progress": 0.75,
    "context": { "user": "John" }
  }
}
```

---

### STATE_DELTA

Emitted for incremental state updates using JSON Patch-like operations.

```typescript
interface StateDeltaEvent extends BaseEvent {
  type: 'STATE_DELTA';
  delta: Array<{
    op: 'add' | 'remove' | 'replace';
    path: string;
    value?: unknown;
  }>;
}
```

**Example:**
```json
{
  "type": "STATE_DELTA",
  "timestamp": 1701234567890,
  "delta": [
    { "op": "replace", "path": "/progress", "value": 0.80 },
    { "op": "add", "path": "/results/0", "value": "item1" }
  ]
}
```

---

### CUSTOM

Custom event for extensibility. Used for features not covered by standard AG-UI events.

```typescript
interface CustomEvent extends BaseEvent {
  type: 'CUSTOM';
  name: string;
  value: unknown;
}
```

**Example (approval request):**
```json
{
  "type": "CUSTOM",
  "name": "approval-requested",
  "model": "gpt-4o",
  "timestamp": 1701234567890,
  "value": {
    "toolCallId": "call_abc123",
    "toolName": "send_email",
    "input": { "to": "user@example.com", "subject": "Hello" },
    "approval": { "id": "approval_xyz789" }
  }
}
```

---

## Event Ordering and Relationships

### Typical Flow

1. **Simple Content Generation:**
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
   TOOL_CALL_START (toolName: "get_weather")
   TOOL_CALL_ARGS (delta: "{\"location\":\"SF\"}")
   TOOL_CALL_END (input: {"location":"SF"}, result: "{...}")
   TEXT_MESSAGE_START
   TEXT_MESSAGE_CONTENT (delta: "The weather is...")
   TEXT_MESSAGE_END
   RUN_FINISHED (finishReason: "stop")
   ```

4. **Client Tool with Approval:**
   ```
   RUN_STARTED
   TOOL_CALL_START (toolName: "send_email", approval: {...})
   TOOL_CALL_ARGS (delta: "{...}")
   CUSTOM (name: "approval-requested")
   [User approves]
   TOOL_CALL_END (input: {...})
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
TOOL_CALL_START (index: 0, toolName: "get_weather")
TOOL_CALL_START (index: 1, toolName: "get_time")
TOOL_CALL_ARGS (toolCallId: "call_1", ...)
TOOL_CALL_ARGS (toolCallId: "call_2", ...)
TOOL_CALL_END (toolCallId: "call_1", ...)
TOOL_CALL_END (toolCallId: "call_2", ...)
TEXT_MESSAGE_START
TEXT_MESSAGE_CONTENT (delta: "Based on the data...")
TEXT_MESSAGE_END
RUN_FINISHED (finishReason: "stop")
```

---

## TypeScript Union Type

All events are represented as a discriminated union:

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
function handleEvent(event: StreamChunk) {
  switch (event.type) {
    case 'TEXT_MESSAGE_CONTENT':
      console.log(event.delta); // TypeScript knows this is TextMessageContentEvent
      break;
    case 'TOOL_CALL_START':
      console.log(event.toolName); // TypeScript knows structure
      break;
    case 'RUN_FINISHED':
      console.log(event.usage); // TypeScript knows this is RunFinishedEvent
      break;
    // ... other cases
  }
}
```

---

## AG-UI Compatibility

TanStack AI's streaming protocol is fully compatible with the AG-UI specification. This means:

1. **Ecosystem Interoperability**: TanStack AI can work with AG-UI-compatible tools and frameworks like LangGraph, CrewAI, and CopilotKit.

2. **Standard Event Types**: All 14 AG-UI event types are supported.

3. **TanStack AI Additions**: We add useful fields like `model` on every event and `content` accumulation on text events for convenience.

4. **Extensibility**: The `CUSTOM` event type allows for any additional functionality not covered by the standard events.

For more information about AG-UI, visit the [official documentation](https://docs.ag-ui.com/introduction).

---

## See Also

- [SSE Protocol](../sse-protocol) - How events are transmitted via Server-Sent Events
- [HTTP Stream Protocol](../http-stream-protocol) - How events are transmitted via HTTP streaming
- [Connection Adapters Guide](../../guides/connection-adapters) - Client implementation
