---
title: AG-UI Event Definitions
id: chunk-definitions
description: "TanStack AI implements the AG-UI protocol — full event definitions, types, and streaming semantics for agent-to-UI communication."
keywords:
  - tanstack ai
  - ag-ui
  - ag-ui protocol
  - events
  - stream chunks
  - streaming protocol
  - agent protocol
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
  | 'RUN_STARTED'                 // Run lifecycle begins
  | 'RUN_FINISHED'                // Run completed successfully
  | 'RUN_ERROR'                   // Error occurred
  | 'TEXT_MESSAGE_START'          // Text message begins
  | 'TEXT_MESSAGE_CONTENT'        // Text content streaming
  | 'TEXT_MESSAGE_END'            // Text message completes
  | 'TOOL_CALL_START'             // Tool invocation begins
  | 'TOOL_CALL_ARGS'              // Tool arguments streaming
  | 'TOOL_CALL_END'               // Tool call completes
  | 'TOOL_CALL_RESULT'            // Tool execution result
  | 'STEP_STARTED'                // Thinking/reasoning step begins
  | 'STEP_FINISHED'               // Thinking/reasoning step completes
  | 'REASONING_START'             // Reasoning begins for a message
  | 'REASONING_MESSAGE_START'     // Reasoning message begins
  | 'REASONING_MESSAGE_CONTENT'   // Reasoning content streaming
  | 'REASONING_MESSAGE_END'       // Reasoning message completes
  | 'REASONING_END'               // Reasoning ends for a message
  | 'REASONING_ENCRYPTED_VALUE'   // Encrypted reasoning payload
  | 'MESSAGES_SNAPSHOT'           // Full conversation transcript snapshot
  | 'STATE_SNAPSHOT'              // Full state synchronization
  | 'STATE_DELTA'                 // Incremental state update
  | 'CUSTOM';                     // Custom extensibility events
```

> The exported `EventType` enum (`@tanstack/ai`) carries a few additional
> internal/transitional members (e.g. `TEXT_MESSAGE_CHUNK`, `TOOL_CALL_CHUNK`,
> `THINKING_*`, `ACTIVITY_*`, `RAW`). The events above are the ones that appear
> on the wire for a normal chat run.

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

> **AG-UI vs TanStack AI:** AG-UI's `RUN_FINISHED` event only defines
> `threadId`, `runId`, and an optional `result`. The `finishReason` and `usage`
> fields below are **TanStack AI extensions** — they ride along on the event
> (AG-UI event schemas are `passthrough`) but are not part of the AG-UI protocol
> itself. `usage` is typed as `TokenUsage`, defined by `@tanstack/ai` and
> mirrored under the same name by `@tanstack/ai-event-client` for wire/devtools
> consumers. (`@tanstack/ai` also exports `UsageTotals` as a deprecated alias of
> `TokenUsage` for backward compatibility.)

```typescript
interface RunFinishedEvent extends BaseAGUIEvent {
  type: 'RUN_FINISHED';
  runId: string;
  finishReason?: 'stop' | 'length' | 'content_filter' | 'tool_calls' | null; // TanStack AI addition
  usage?: TokenUsage;                                                         // TanStack AI addition
}

// TanStack AI extension — not an AG-UI primitive.
interface TokenUsage {
  // Core token counts (always present when usage is available)
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;

  // Detailed prompt token breakdown (provider-dependent)
  promptTokensDetails?: {
    cachedTokens?: number;       // Tokens read from cache (prompt cache hits)
    cacheWriteTokens?: number;   // Tokens written to cache (Anthropic cache creation)
    audioTokens?: number;        // Audio input tokens
    videoTokens?: number;        // Video input tokens
    imageTokens?: number;        // Image input tokens
    textTokens?: number;         // Text input tokens
    documentTokens?: number;     // Document input tokens (e.g. PDF inputs on Gemini)
  };

  // Detailed completion token breakdown (provider-dependent)
  completionTokensDetails?: {
    reasoningTokens?: number;    // Reasoning/thinking tokens (o1, Claude thinking)
    audioTokens?: number;        // Audio output tokens
    videoTokens?: number;        // Video output tokens
    imageTokens?: number;        // Image output tokens
    textTokens?: number;         // Text output tokens
    documentTokens?: number;     // Document output tokens
  };

  // Duration in seconds for duration-billed models (e.g. Whisper transcription)
  durationSeconds?: number;

  // Provider-specific fields not covered by the standard schema (e.g. OpenRouter
  // accepted/rejectedPredictionTokens, Anthropic serverToolUse)
  providerUsageDetails?: Record<string, unknown>;

  // Provider-reported cost, when available (e.g. OpenRouter)
  cost?: number;
  costDetails?: {
    upstreamCost?: number;        // Total cost the gateway paid upstream
    upstreamInputCost?: number;   // Upstream cost for input (prompt) tokens
    upstreamOutputCost?: number;  // Upstream cost for output (completion) tokens
  };
}
```

**Example (basic usage):**
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

**Example (with cached tokens - OpenAI):**
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
    "totalTokens": 225,
    "promptTokensDetails": {
      "cachedTokens": 100
    }
  }
}
```

**Example (with reasoning tokens - o1):**
```json
{
  "type": "RUN_FINISHED",
  "runId": "run_abc123",
  "model": "o1-preview",
  "timestamp": 1701234567892,
  "finishReason": "stop",
  "usage": {
    "promptTokens": 150,
    "completionTokens": 500,
    "totalTokens": 650,
    "completionTokensDetails": {
      "reasoningTokens": 425
    }
  }
}
```

**Example (Anthropic with cache):**
```json
{
  "type": "RUN_FINISHED",
  "runId": "run_abc123",
  "model": "claude-3-5-sonnet",
  "timestamp": 1701234567892,
  "finishReason": "stop",
  "usage": {
    "promptTokens": 150,
    "completionTokens": 75,
    "totalTokens": 225,
    "promptTokensDetails": {
      "cacheWriteTokens": 50,
      "cachedTokens": 100
    }
  }
}
```

**Example (OpenRouter with cost):**
```json
{
  "type": "RUN_FINISHED",
  "runId": "run_abc123",
  "model": "openai/gpt-4o",
  "timestamp": 1701234567892,
  "finishReason": "stop",
  "usage": {
    "promptTokens": 150,
    "completionTokens": 75,
    "totalTokens": 225,
    "cost": 0.0012,
    "costDetails": {
      "upstreamInputCost": 0.0008,
      "upstreamOutputCost": 0.0004
    }
  }
}
```

**Token Usage Notes:**
- `usage` is a TanStack AI extension to the AG-UI `RUN_FINISHED` event; all fields beyond the three core counts are optional and provider-dependent.
- `promptTokensDetails.cachedTokens` - Tokens read from cache (OpenAI/Anthropic prompt caching)
- `promptTokensDetails.cacheWriteTokens` - Tokens written to cache (Anthropic prompt caching)
- `completionTokensDetails.reasoningTokens` - Internal reasoning tokens (o1, Claude thinking)
- `durationSeconds` - Set by duration-billed models (e.g. Whisper transcription) instead of token counts
- `providerUsageDetails` - Provider-specific fields not in the standard schema (e.g. OpenRouter's accepted/rejected prediction tokens, Anthropic's server tool use)
- `cost` / `costDetails` - Provider-reported per-request cost, populated only by gateways that return it (e.g. OpenRouter)
- For Gemini, modality-specific token counts (audio, video, image, text) are extracted from the response


---

### RUN_ERROR

Emitted when an error occurs during a run.

> **Canonical vs deprecated shape.** The AG-UI-canonical form carries
> `message` and `code` at the **top level** of the event. The nested `error`
> object is a TanStack AI backward-compatibility alias and is `@deprecated`;
> prefer reading the top-level fields. Note that the wire emitter
> (`toServerSentEventsStream` / `toHttpStream`) still emits the nested `error`
> form, so consumers should accept either until the alias is removed.

```typescript
interface RunErrorEvent extends BaseAGUIEvent {
  type: 'RUN_ERROR';
  message: string;     // Canonical (AG-UI)
  code?: string;       // Canonical (AG-UI)
  runId?: string;
  /** @deprecated Use top-level `message`/`code`. Still emitted on the wire. */
  error?: {
    message: string;
    code?: string;
  };
}
```

**Example (as emitted on the wire — nested `error`):**
```json
{
  "type": "RUN_ERROR",
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
  toolCallName: string;  // Canonical (AG-UI)
  /** @deprecated Use `toolCallName` instead. */
  toolName: string;      // Deprecated alias, still emitted
  index?: number;        // Index for parallel tool calls
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
  toolCallName?: string;  // Canonical (AG-UI)
  /** @deprecated Use `toolCallName` instead. */
  toolName?: string;      // Deprecated alias
  input?: unknown;        // Final parsed input arguments (TanStack AI internal)
  result?: string | ContentPart[]; // Tool execution result (TanStack AI internal)
}
```

---

### TOOL_CALL_RESULT

Emitted when a tool's execution result is available. AG-UI carries this as a
distinct event from `TOOL_CALL_END`: `TOOL_CALL_END` closes the call's
argument stream, while `TOOL_CALL_RESULT` delivers the executed tool's output
as a `tool`-role message.

```typescript
interface ToolCallResultEvent extends BaseAGUIEvent {
  type: 'TOOL_CALL_RESULT';
  messageId: string;   // ID of the resulting tool-role message
  toolCallId: string;  // The tool call this result answers
  content: string;     // Serialized tool result
  role?: 'tool';
}
```

**Example:**
```json
{
  "type": "TOOL_CALL_RESULT",
  "messageId": "msg_tool_1",
  "toolCallId": "call_xyz",
  "content": "{\"temperature\":72,\"conditions\":\"sunny\"}",
  "timestamp": 1701234567894
}
```

---

### STEP_STARTED

Emitted when a thinking/reasoning step starts.

```typescript
interface StepStartedEvent extends BaseAGUIEvent {
  type: 'STEP_STARTED';
  stepName: string;    // Canonical (AG-UI)
  /** @deprecated Use `stepName` instead. */
  stepId?: string;     // Deprecated alias
  stepType?: string;   // e.g., 'thinking', 'planning'
}
```

---

### STEP_FINISHED

Emitted when a thinking/reasoning step finishes.

```typescript
interface StepFinishedEvent extends BaseAGUIEvent {
  type: 'STEP_FINISHED';
  stepName: string;    // Canonical (AG-UI)
  /** @deprecated Use `stepName` instead. */
  stepId?: string;     // Deprecated alias
  delta?: string;      // Incremental thinking content (TanStack AI internal)
  content?: string;    // Full accumulated thinking content (TanStack AI internal)
}
```

---

## Reasoning Events

AG-UI defines a dedicated reasoning event family for thinking/reasoning models.
**These `REASONING_MESSAGE_*` events are the AG-UI-canonical path for reasoning
content.** During a transition period, adapters also emit `STEP_FINISHED` with
the same thinking deltas as a backward-compatibility duplicate; the stream
processor de-duplicates by ignoring `STEP_FINISHED` thinking deltas once it has
seen reasoning events for a message (see
`packages/ai/src/activities/chat/stream/processor.ts`). Prefer
`REASONING_MESSAGE_*` in new consumers.

All reasoning events extend `BaseAGUIEvent`. TanStack AI adds an optional
`model?` field; the canonical fields come from `@ag-ui/core`.

### REASONING_START

Reasoning begins for a message.

```typescript
interface ReasoningStartEvent extends BaseAGUIEvent {
  type: 'REASONING_START';
  messageId: string;
}
```

### REASONING_MESSAGE_START

A reasoning message begins.

```typescript
interface ReasoningMessageStartEvent extends BaseAGUIEvent {
  type: 'REASONING_MESSAGE_START';
  messageId: string;
  role: 'reasoning';
}
```

### REASONING_MESSAGE_CONTENT

Incremental reasoning content (streaming tokens).

```typescript
interface ReasoningMessageContentEvent extends BaseAGUIEvent {
  type: 'REASONING_MESSAGE_CONTENT';
  messageId: string;
  delta: string;
}
```

### REASONING_MESSAGE_END

A reasoning message completes.

```typescript
interface ReasoningMessageEndEvent extends BaseAGUIEvent {
  type: 'REASONING_MESSAGE_END';
  messageId: string;
}
```

### REASONING_END

Reasoning ends for a message.

```typescript
interface ReasoningEndEvent extends BaseAGUIEvent {
  type: 'REASONING_END';
  messageId: string;
}
```

### REASONING_ENCRYPTED_VALUE

Carries an encrypted/opaque reasoning payload (e.g. provider-encrypted thinking
that can be replayed but not read).

```typescript
interface ReasoningEncryptedValueEvent extends BaseAGUIEvent {
  type: 'REASONING_ENCRYPTED_VALUE';
  subtype: string;
  entityId: string;
  encryptedValue: string;
}
```

---

## MESSAGES_SNAPSHOT

Delivers a full snapshot of the conversation transcript. Unlike
`STATE_SNAPSHOT` (which carries arbitrary application state),
`MESSAGES_SNAPSHOT` specifically carries the message list.

```typescript
interface MessagesSnapshotEvent extends BaseAGUIEvent {
  type: 'MESSAGES_SNAPSHOT';
  messages: Message[];  // @ag-ui/core Message[] — use converters for UIMessage
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
  | ToolCallResultEvent
  | StepStartedEvent
  | StepFinishedEvent
  | MessagesSnapshotEvent
  | StateSnapshotEvent
  | StateDeltaEvent
  | CustomEvent
  | ReasoningStartEvent
  | ReasoningMessageStartEvent
  | ReasoningMessageContentEvent
  | ReasoningMessageEndEvent
  | ReasoningEndEvent
  | ReasoningEncryptedValueEvent;
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
      console.log(chunk.toolCallName);
      break;
    // ... other cases
  }
}
```

---

## See Also

- [SSE Protocol](./sse-protocol) - How chunks are transmitted via Server-Sent Events
- [HTTP Stream Protocol](./http-stream-protocol) - How chunks are transmitted via HTTP streaming
- [Connection Adapters Guide](../chat/connection-adapters) - Client implementation
