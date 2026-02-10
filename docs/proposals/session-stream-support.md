# RFC: Durable Session Support for TanStack AI

> **Status**: Draft
> **Authors**: thruflo
> **Created**: 2026-02-09
> **Last Updated**: 2026-02-09


## Summary

This proposal outlines changes to TanStack AI that would enable **durable sessions** - a pattern where a persistent, append-only stream serves as the source of truth for a conversation.

This enables:

- **resilience**: tolerate patchy connectivity and tab backgrounding
- **resumability**: reconnect and resume active generations; survives page refreshes and re-renders
- **persistence**: Full conversation history lives in the stream
- **multi-user/agent/tab/device**: Messages from any source appear in real-time

The proposed changes are backwards compatible and align TanStack AI more closely with the AG-UI protocol specification.


## Motivation

### Current Architecture

TanStack AI's `ChatClient` and `useChat` hook are built around a **request-response model**:

1. User calls `sendMessage(content)`
2. Client calls `connection.connect(messages)`
3. Connection adapter makes HTTP request, returns `AsyncIterable<StreamChunk>`
4. Client processes chunks, builds assistant message
5. Stream ends, client returns to ready state

This model works well for simple chat UIs but breaks down in several scenarios.

### Problem 1: No resumability

If the user refreshes the page mid-generation, or the network drops, the response is lost. There's no way to resume where the stream left off.

### Problem 2: Single-user assumption

The current model assumes one user sends a message and receives a response. It doesn't support:

- multiple users in the same conversation
- multiple AI agents responding
- messages arriving from other tabs/devices
- background agents adding messages asynchronously

### Problem 3: Tight coupling of send and receive

`sendMessage()` both writes a user message AND waits for the response stream. For session streams, these should be decoupled:

- **write**: add message to session (proxy writes to stream)
- **read**: continuously consume from stream (independent of writes)

### Problem 4: Type limitations

Current types don't fully align with AG-UI:

- `TextMessageStartEvent.role` is hardcoded to `'assistant'`
- tool events lack `parentMessageId` for message correlation
- no support for user messages as stream events


## Background: Durable session pattern

### What is a Session Stream?

A session stream is a durable, append-only log of conversation events. All participants (users, agents) write to the same stream, and all clients consume from it.

```
┌──────────────────────────────────────────────────────────────┐
│                    Session Stream                            │
│  [user-msg-1] [assistant-chunk] [chunk] [chunk] [run-end]    │
│  [user-msg-2] [assistant-chunk] [tool-call] [chunk] ...      │
└──────────────────────────────────────────────────────────────┘
        ▲                              │
        │ write                        │ consume
        │                              ▼
   ┌─────────┐                  ┌─────────────┐
   │ Client  │                  │   Client    │
   │   A     │                  │   A, B, C   │
   └─────────┘                  └─────────────┘
```

### How it differs from request-response

| Aspect | Request-Response | Durable Session |
|--------|------------------|-----------------|
| Connection | Per-request | Persistent |
| Message source | Only "my" responses | Any participant |
| History | Loaded separately | Consumed from stream |
| Resume | Not possible | Natural (just consume) |
| Send/Receive | Coupled | Decoupled |

### Durable Streams integration

The [Durable Streams](https://electric-sql.com/products/durable-streams) project provides infrastructure for this pattern:

- persistent, addressable streams with reliable delivery
- resumable consumption with offset tracking
- URL-based access with signature renewal
- proxy service that forwards requests and captures responses


## Key Insights from analysis

### 1. StreamProcessor Ignores `messageId`

The current `StreamProcessor` generates its own message IDs and tracks only a single `currentAssistantMessageId`. It doesn't use the `messageId` from incoming chunks.

```typescript
// Current behavior - ignores chunk.messageId
startAssistantMessage(): string {
  const assistantMessage: UIMessage = {
    id: generateMessageId(),  // Always generates new ID
    role: 'assistant',
    // ...
  }
  this.currentAssistantMessageId = assistantMessage.id
}
```

**Impact**: Cannot correlate messages across reconnects or deduplicate.

### 2. Tool Events Lack Message Correlation

AG-UI specifies `parentMessageId` on tool call events, but TanStack AI doesn't implement this:

| Event | AG-UI Spec | TanStack AI |
|-------|-----------|-------------|
| `ToolCallStart.parentMessageId` | Optional | Missing |
| `ToolCallStart.toolCallId` | Required | Implemented |

**Mitigation**: We can track `toolCallId → messageId` mapping ourselves based on stream order. The `toolCallId` is sufficient to correlate tool call chunks together. When `parentMessageId` is available, we use it; otherwise, we associate tool calls with the most recently active message.

### 3. AG-UI Supports User Messages

The AG-UI protocol's `TextMessageStart` event has a `role` field supporting `'user' | 'assistant' | 'system' | 'tool'`. User messages can use standard `TEXT_MESSAGE_*` events - they don't need a custom format.

```typescript
// AG-UI supports this
{ type: 'TEXT_MESSAGE_START', messageId: 'msg-1', role: 'user', timestamp: ... }
{ type: 'TEXT_MESSAGE_CONTENT', messageId: 'msg-1', delta: 'Hello!', ... }
{ type: 'TEXT_MESSAGE_END', messageId: 'msg-1', timestamp: ... }
```

### 4. Multi-Message Interleaving is Manageable

While true chunk-level interleaving of multiple assistant responses could be complex, in practice:

- Each LLM response streams sequentially (text, then tool calls)
- Interleaving happens at the response level, not chunk level
- We can track "active message" and associate chunks correctly

### 5. Message Ordering Should Use Position, Not Timestamps

Timestamps can have clock skew across clients. The stream itself is ordered. A simple counter based on first-seen order is more reliable:

```typescript
private messageOrder: Map<string, number> = new Map()
private orderCounter = 0

getOrAssignOrder(messageId: string): number {
  if (!this.messageOrder.has(messageId)) {
    this.messageOrder.set(messageId, this.orderCounter++)
  }
  return this.messageOrder.get(messageId)!
}
```

### 6. User Message Deduplication

When a client sends a message optimistically, then sees it echoed back from the stream, we need deduplication:

1. Client generates `messageId`, adds to local state as "pending"
2. Client sends to proxy with that `messageId`
3. Proxy writes `TEXT_MESSAGE_*` events with that `messageId` to stream
4. Client sees message from stream - if `messageId` matches pending, confirm; else add new


## Proposed Changes

### Phase 1: Type Alignment with AG-UI

**File**: `packages/typescript/ai/src/types.ts`

#### 1.1 TextMessageStartEvent Role

```typescript
// Before
export interface TextMessageStartEvent extends BaseAGUIEvent {
  type: 'TEXT_MESSAGE_START'
  messageId: string
  role: 'assistant'  // Hardcoded
}

// After
export interface TextMessageStartEvent extends BaseAGUIEvent {
  type: 'TEXT_MESSAGE_START'
  messageId: string
  role: 'user' | 'assistant' | 'system' | 'tool'  // Align with AG-UI
}
```

#### 1.2 Tool Events - Add parentMessageId

```typescript
// Add to ToolCallStartEvent
export interface ToolCallStartEvent extends BaseAGUIEvent {
  type: 'TOOL_CALL_START'
  toolCallId: string
  toolName: string
  parentMessageId?: string  // NEW - optional, for message correlation
  index?: number
}

// Similarly for ToolCallArgsEvent and ToolCallEndEvent
```

**Rationale**: Aligns with AG-UI specification. Fully backwards compatible.

---

### Phase 2: StreamProcessor Enhancements

**File**: `packages/typescript/ai/src/activities/chat/stream/processor.ts`

#### 2.1 Use messageId from Chunks

```typescript
// Before
startAssistantMessage(): string {
  const assistantMessage: UIMessage = {
    id: generateMessageId(),
    role: 'assistant',
    // ...
  }
}

// After - accept optional parameters
startMessage(options?: {
  messageId?: string
  role?: 'user' | 'assistant'
}): string {
  const {
    messageId = generateMessageId(),
    role = 'assistant'
  } = options ?? {}

  const message: UIMessage = {
    id: messageId,
    role,
    parts: [],
    createdAt: new Date(),
  }
  // ...
}
```

When processing `TEXT_MESSAGE_START`:

```typescript
case 'TEXT_MESSAGE_START':
  this.startMessage({
    messageId: chunk.messageId,
    role: chunk.role
  })
  break
```

**Rationale**: Enables deduplication and correlation with external systems. Backwards compatible - generates ID if none provided.

#### 2.2 Multi-Message State Tracking

```typescript
// Before - single message state
private currentAssistantMessageId: string | null = null
private textContent = ''
private toolCalls: Map<string, ToolCallState> = new Map()

// After - per-message state
private messageStates: Map<string, MessageStreamState> = new Map()
private activeMessageId: string | null = null  // Most recently seen
private toolCallToMessage: Map<string, string> = new Map()  // toolCallId -> messageId

interface MessageStreamState {
  textContent: string
  currentSegmentText: string
  toolCalls: Map<string, InternalToolCallState>
  isComplete: boolean
}
```

Chunk processing routes to correct message:

```typescript
case 'TEXT_MESSAGE_CONTENT':
  const state = this.getOrCreateMessageState(chunk.messageId)
  state.textContent += chunk.delta
  this.activeMessageId = chunk.messageId
  this.updateMessageParts(chunk.messageId)
  break

case 'TOOL_CALL_START':
  // Prefer explicit parentMessageId, fall back to active message
  const messageId = (chunk as any).parentMessageId ?? this.activeMessageId
  if (messageId) {
    this.toolCallToMessage.set(chunk.toolCallId, messageId)
    this.addToolCallToMessage(messageId, chunk)
  }
  break

case 'TOOL_CALL_ARGS':
  const msgId = this.toolCallToMessage.get(chunk.toolCallId)
  if (msgId) {
    this.updateToolCallArgs(msgId, chunk)
  }
  break
```

**Rationale**: Enables multi-agent scenarios. Backwards compatible - single message case works identically.

---

### Phase 3: ChatClient Session Support

**File**: `packages/typescript/ai-client/src/chat-client.ts`

This phase requires further DX exploration. The core need is to decouple:

1. **Consuming a stream** (continuous, independent of sends)
2. **Sending messages** (writes to proxy, doesn't wait for response)

#### Areas to Explore

##### Option A: Explicit Methods

```typescript
// New method - consume an external stream
async consumeStream(stream: AsyncIterable<StreamChunk>): Promise<void> {
  for await (const chunk of stream) {
    this.callbacksRef.current.onChunk(chunk)
    this.processor.processChunk(chunk)
  }
}

// New method - send without expecting response via connection
async sendMessageToStream(content: string): Promise<UIMessage> {
  const userMessage = this.processor.addUserMessage(content)
  this.events.messageSent(userMessage.id, content)
  return userMessage
}
```

##### Option B: Session-Aware Connection Adapter

Extend the connection adapter interface:

```typescript
interface SessionConnectionAdapter extends ConnectionAdapter {
  // Subscribe to persistent stream
  subscribe(): AsyncIterable<StreamChunk>

  // Write message (doesn't return response stream)
  write(message: UserMessage): Promise<void>

  // URL renewal support
  renewUrl?(): Promise<string>
}
```

ChatClient detects session adapter and behaves accordingly.

##### Option C: Always Session-Compatible with Extension Hooks

Make ChatClient always work in a session-compatible way, with hooks for customization:

```typescript
interface ChatClientOptions {
  // ... existing options

  // Hook: customize how user messages are added (e.g., optimistic + pending state)
  onUserMessageCreated?: (message: UIMessage) => UIMessage

  // Hook: customize send behavior (e.g., write to proxy instead of connect)
  sendHandler?: (message: UIMessage, messages: UIMessage[]) => Promise<void>

  // Hook: customize how incoming messages are reconciled
  reconcileMessage?: (incoming: UIMessage, existing: UIMessage | undefined) => UIMessage
}
```

##### Integration with Durable Fetch

The existing `fetchServerSentEvents` adapter supports a `fetchClient` option for custom fetch implementations. A durable fetch client can intercept requests and route through the proxy:

```typescript
const durableFetch = createDurableFetch({ proxyUrl: PROXY_URL })

const connection = fetchServerSentEvents('/api/chat', {
  fetchClient: durableFetch
})
```

The question is how this integrates with session streams:

1. Does `durableFetch` return a stream URL that the client then subscribes to?
2. How does the subscription lifecycle map to the connection adapter interface?
3. How are user messages written vs. responses consumed?

**These integration patterns need further exploration.**

---

### Phase 4: useChat Hook Updates

**File**: `packages/typescript/ai-react/src/use-chat.ts`

```typescript
interface UseChatOptions {
  // ... existing options

  /**
   * Session stream to consume. When provided, messages are consumed from
   * this stream instead of using request-response flow.
   */
  sessionStream?: AsyncIterable<StreamChunk>

  /**
   * Handler for writing messages in session mode.
   * Called instead of connection.connect() when sessionStream is provided.
   */
  onSendMessage?: (message: UIMessage) => Promise<void>

  /**
   * Called when initial history has been loaded from the stream.
   */
  onConnected?: (messageCount: number) => void
}
```

**Rationale**: Clean session support at hook level. Fully backwards compatible.

---

## Migration Path

### For Existing Users

No changes required. All existing code continues to work:

- `useChat` with `connection` adapter works identically
- Request-response flow unchanged
- Types are backwards compatible (existing `'assistant'` role still valid)

### For Session Stream Adopters

1. Update to new version
2. Provide `sessionStream` and `onSendMessage` options
3. Set up durable stream infrastructure (proxy, stream client)

---

## Open Questions

### DX Design

1. **consumeStream vs sessionStream option**: Should stream consumption be a method call or a configuration option?

2. **Integration with connection adapters**: How should session streams integrate with the existing `fetchServerSentEvents` / durable fetch pattern? Is a new adapter type needed?

3. **Optimistic updates**: How should the client handle optimistic user message display while waiting for stream confirmation? Extension hooks? Built-in pending state?

4. **Loading state semantics**: With multiple concurrent messages, what does `isLoading` mean? Per-message loading state?

### Protocol Alignment

1. **MessagesSnapshot**: Should we support AG-UI's `MessagesSnapshot` event for initial state sync? How does this interact with streaming history?

2. **Tool execution gating**: In multi-user streams, should we gate auto-tool-execution to only "our" runs? How do we identify message/run origin?

### Infrastructure

1. **URL renewal**: How should stream URL renewal (for expiring signatures) be exposed? Callback? Automatic retry?

2. **Reconnection**: Should the client handle reconnection, or delegate to the stream client library?

---

## Appendix: Current Code References

### Key Files

| File | Purpose |
|------|---------|
| `packages/typescript/ai/src/types.ts` | Core types including StreamChunk, AG-UI events |
| `packages/typescript/ai/src/activities/chat/stream/processor.ts` | StreamProcessor - chunk processing state machine |
| `packages/typescript/ai-client/src/chat-client.ts` | ChatClient - orchestrates connection and processor |
| `packages/typescript/ai-client/src/connection-adapters.ts` | Connection adapter implementations |
| `packages/typescript/ai-react/src/use-chat.ts` | React hook integration |

### Current StreamProcessor Limitations

1. **Single message tracking**: `currentAssistantMessageId` is singular
2. **ID generation**: Always generates new IDs, ignores chunk messageId
3. **Role assumption**: Hardcodes `'assistant'` role
4. **Tool correlation**: No explicit message-to-tool mapping (relies on temporal ordering)

### Current ChatClient Limitations

1. **Coupled send/receive**: `sendMessage` → `streamResponse` → `connect` → `processStream`
2. **Blocking sends**: `isLoading` prevents concurrent sends
3. **No external chunk injection**: Can't feed chunks from external stream

---

## References

- [AG-UI Protocol Events](https://docs.ag-ui.com/concepts/events)
- [Durable Streams](https://electric-sql.com/products/durable-streams)
- [TanStack AI Connection Adapters](https://tanstack.com/ai/latest/docs/guides/connection-adapters)
