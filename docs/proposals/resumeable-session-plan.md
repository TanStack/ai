# Implementation Plan: Resumeable Session Support

> **Purpose**: Step-by-step guide for implementing resumeable session support in TanStack AI.
> Produces a PR with code changes + a PR description markdown artifact for review.
>
> **Approach**: Unified SessionAdapter (Approach B). The ChatClient always operates
> through a `SessionAdapter` interface. When only a `ConnectionAdapter` is provided,
> it is wrapped in a `DefaultSessionAdapter` internally.
>
> **Design context**: See `docs/proposals/session-stream-support.md` for full rationale.

---

## Progress

Steps 1–3 are **complete** (with revisions noted inline). The following revisions
were made during implementation:

1. `getActiveAssistantMessageId` — iterates the Set in reverse via `Array.from()` +
   backward loop, returning on first assistant match
2. `onStreamEnd` — fires for every message on `TEXT_MESSAGE_END`, not just the last one
3. `STATE_SNAPSHOT` — handler and tests removed. Event falls through to the default
   no-op case. Replaced by `MESSAGES_SNAPSHOT` (see Step 3e)
4. `ensureAssistantMessage` — calls `onStreamStart` and `emitMessagesChange` when it
   auto-creates a message

### PR Boundary

**PR 1 (this PR)**: Steps 1–3 — StreamProcessor per-message state refactor +
AG-UI type alignment + `MESSAGES_SNAPSHOT` support.

**PR 2 (follow-up)**: Steps 4–7 — SessionAdapter interface, DefaultSessionAdapter,
ChatClient refactor, framework hook updates.

**Future PR**: `STATE_SNAPSHOT` / `STATE_DELTA` handling with managed `sessionState`
container (see "Extensibility: Session State" section at the end of this document).

---

## Pre-flight

Before starting, verify the baseline:

```bash
cd packages/typescript/ai && pnpm test:lib && cd ../../..
cd packages/typescript/ai-client && pnpm test:lib && cd ../../..
cd packages/typescript/ai-react && pnpm test:lib && cd ../../..
```

All existing tests must pass before any changes.

---

## Step 1: AG-UI Type Alignment [DONE]

**Files**: `packages/typescript/ai/src/types.ts`

### 1a. Expand `TextMessageStartEvent.role`

```typescript
// Before
export interface TextMessageStartEvent extends BaseAGUIEvent {
  type: 'TEXT_MESSAGE_START'
  messageId: string
  role: 'assistant'  // hardcoded
}

// After
export interface TextMessageStartEvent extends BaseAGUIEvent {
  type: 'TEXT_MESSAGE_START'
  messageId: string
  role: 'user' | 'assistant' | 'system' | 'tool'
}
```

### 1b. Add `parentMessageId` to `ToolCallStartEvent`

```typescript
export interface ToolCallStartEvent extends BaseAGUIEvent {
  type: 'TOOL_CALL_START'
  toolCallId: string
  toolName: string
  parentMessageId?: string  // NEW
  index?: number
}
```

### 1c. Add `MessagesSnapshotEvent`

AG-UI defines `MessagesSnapshot` as a first-class event type, distinct from
`StateSnapshot`. It delivers a complete history of messages in the current
conversation — used for initializing chat history, synchronizing after connection
interruptions, or hydrating state when a user joins an ongoing conversation.

```typescript
/**
 * Emitted to provide a snapshot of all messages in a conversation.
 *
 * Unlike StateSnapshot (which carries arbitrary application state),
 * MessagesSnapshot specifically delivers the conversation transcript.
 * This is a first-class AG-UI event type.
 */
export interface MessagesSnapshotEvent extends BaseAGUIEvent {
  type: 'MESSAGES_SNAPSHOT'
  /** Complete array of messages in the conversation */
  messages: Array<UIMessage>
}
```

Add `'MESSAGES_SNAPSHOT'` to the `AGUIEventType` union and `MessagesSnapshotEvent`
to the `AGUIEvent` union (and therefore `StreamChunk`).

### 1d. Verify

Run `pnpm test:types` in the `ai` package. These are purely additive type changes
with no behavioral impact. Existing code that sets `role: 'assistant'` still compiles.

---

## Step 2: StreamProcessor — Per-Message State Types [DONE]

**Files**: `packages/typescript/ai/src/activities/chat/stream/types.ts`

### 2a. Add `MessageStreamState` interface

```typescript
/**
 * Per-message streaming state.
 * Tracks the accumulation of text, tool calls, and thinking content
 * for a single message in the stream.
 */
export interface MessageStreamState {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  totalTextContent: string
  currentSegmentText: string
  lastEmittedText: string
  thinkingContent: string
  toolCalls: Map<string, InternalToolCallState>
  toolCallOrder: Array<string>
  hasToolCallsSinceTextStart: boolean
  isComplete: boolean
}
```

---

## Step 3: StreamProcessor — Refactor to Per-Message State [DONE]

**Files**: `packages/typescript/ai/src/activities/chat/stream/processor.ts`

This is the largest change. The existing single-message state variables are replaced
with a `Map<string, MessageStreamState>` keyed by messageId.

### 3a. Replace instance variables

Remove:
```
- currentAssistantMessageId: string | null
- totalTextContent: string
- currentSegmentText: string
- lastEmittedText: string
- thinkingContent: string
- toolCalls: Map<string, InternalToolCallState>
- toolCallOrder: Array<string>
- hasToolCallsSinceTextStart: boolean
```

Add:
```
- messageStates: Map<string, MessageStreamState>
- activeMessageIds: Set<string>           // messages currently streaming
- toolCallToMessage: Map<string, string>  // toolCallId → messageId
- pendingManualMessageId: string | null   // from startAssistantMessage() for compat
```

Keep shared:
```
- finishReason: string | null
- isDone: boolean
```

### 3b. Add helper methods

- `createMessageState(messageId, role): MessageStreamState` — creates and stores state
- `getMessageState(messageId): MessageStreamState | undefined` — lookup by messageId
- `getActiveAssistantMessageId(): string | null` — returns the most recent active
  assistant messageId. Iterates `activeMessageIds` in reverse (Set is insertion-order;
  convert to array and search backward). Used as fallback for events without messageId
  routing.
- `ensureAssistantMessage(preferredId?): { messageId, state }` — finds or auto-creates
  an assistant message. Fires `onStreamStart` and `emitMessagesChange` when it
  auto-creates (backward compat for streams without `TEXT_MESSAGE_START`).

### 3c. Handle `TEXT_MESSAGE_START` in `processChunk`

Currently in the `default:` case (ignored). Move to explicit handler:

```typescript
case 'TEXT_MESSAGE_START':
  this.handleTextMessageStartEvent(chunk)
  break
```

Handler logic:
1. If `pendingManualMessageId` is set (from `startAssistantMessage()`):
   - Associate the manual message with this event's messageId
   - Update the message's ID in the messages array if they differ
   - Clear `pendingManualMessageId`
   - Create `MessageStreamState` for the (now-resolved) messageId
2. If a message with this messageId already exists in messages (dedup):
   - Just add to `activeMessageIds` and create state if missing
3. Otherwise:
   - Create a new `UIMessage` with the given `messageId` and `role`
   - Add to messages array
   - Create `MessageStreamState`
   - Add to `activeMessageIds`
   - Emit `onStreamStart` and `onMessagesChange`

### 3d. Handle `TEXT_MESSAGE_END` in `processChunk`

Currently in the `default:` case (ignored). Move to explicit handler:

```typescript
case 'TEXT_MESSAGE_END':
  this.handleTextMessageEndEvent(chunk)
  break
```

Handler logic:
1. Get the `MessageStreamState` for `chunk.messageId`
2. Emit any pending text for this message
3. Complete all tool calls for this message
4. Mark state as `isComplete = true`
5. Remove from `activeMessageIds`
6. Emit `onStreamEnd` for this message (fires per-message, not only on last)

### 3e. Handle `MESSAGES_SNAPSHOT` in `processChunk`

Add explicit handler for the AG-UI `MESSAGES_SNAPSHOT` event:

```typescript
case 'MESSAGES_SNAPSHOT':
  this.handleMessagesSnapshotEvent(chunk)
  break
```

Handler logic:
1. Set `this.messages` to the snapshot messages (normalize with `normalizeToUIMessage`
   if needed, or accept as-is if already in `UIMessage` format)
2. Emit `onMessagesChange`

This is deliberately minimal. `MESSAGES_SNAPSHOT` is a first-class AG-UI event
for conversation hydration. It does NOT handle arbitrary application state —
that's `STATE_SNAPSHOT` / `STATE_DELTA`, which remain in the default no-op case
and are deferred to a future PR (see "Extensibility: Session State" below).

**Why this isn't a special case**: `MESSAGES_SNAPSHOT` is a distinct AG-UI event
type with its own shape (`{ messages: Array<...> }`), separate from `StateSnapshot`
(`{ snapshot: Record<string, unknown> }`). The SessionAdapter returns
`AsyncIterable<StreamChunk>` where `StreamChunk = AGUIEvent`. Adding event handlers
is purely additive — each new `case` branch in `processChunk()` handles one more
event type. The adapter interface doesn't change.

### 3f. Update `TEXT_MESSAGE_CONTENT` handler

Route by `chunk.messageId`:
1. Get state via `ensureAssistantMessage(chunk.messageId)` — falls back to active
   assistant message, or auto-creates one (backward compat)
2. All text accumulation logic stays the same, but operates on the per-message state
3. `emitTextUpdate` receives the messageId to update the correct message

### 3g. Update `TOOL_CALL_START` handler

Route by `parentMessageId` or active message:
1. Determine messageId: `chunk.parentMessageId ?? getActiveAssistantMessageId()`
2. Store mapping: `toolCallToMessage.set(chunk.toolCallId, messageId)`
3. Get state for that messageId
4. Rest of logic (create InternalToolCallState, update UIMessage) stays the same
   but uses `messageId` from the mapping instead of `currentAssistantMessageId`

### 3h. Update `TOOL_CALL_ARGS`, `TOOL_CALL_END` handlers

Route via `toolCallToMessage.get(chunk.toolCallId)` to get the messageId.
Logic stays the same but uses per-message state.

### 3i. Update `STEP_FINISHED`, `CUSTOM` handlers

Route to `getActiveAssistantMessageId()`. Logic stays the same.

### 3j. Update `startAssistantMessage()` for backwards compatibility

```typescript
startAssistantMessage(messageId?: string): string {
  this.resetStreamState()
  const id = messageId ?? generateMessageId()

  const assistantMessage: UIMessage = {
    id, role: 'assistant', parts: [], createdAt: new Date()
  }

  this.messages = [...this.messages, assistantMessage]
  this.createMessageState(id, 'assistant')
  this.activeMessageIds.add(id)

  // Mark as manually created — TEXT_MESSAGE_START will associate with this
  this.pendingManualMessageId = id

  this.events.onStreamStart?.()
  this.emitMessagesChange()
  return id
}
```

### 3k. Update `resetStreamState()`

Clear `messageStates`, `activeMessageIds`, `toolCallToMessage`, `pendingManualMessageId`.

### 3l. Update `finalizeStream()`

Finalize ALL active messages (emit pending text, complete tool calls for each).
Clear `activeMessageIds`. Emit `onStreamEnd` for the last assistant message.

### 3m. Update `areAllToolsComplete()`

No change needed — it already looks at the last assistant message's parts in the
messages array, not at internal state.

### 3n. Verify

Run existing `stream-processor.test.ts`. All existing tests should pass because
they use `startAssistantMessage()` which creates the per-message state via the
backwards-compat path.

Add new tests:
- `TEXT_MESSAGE_START` creates a message with correct role and messageId
- `TEXT_MESSAGE_START` with `role: 'user'` creates a user message
- `TEXT_MESSAGE_END` finalizes the message and emits `onStreamEnd`
- `TEXT_MESSAGE_END` emits pending text that was buffered by chunk strategy
- Two interleaved assistant messages (TEXT_MESSAGE_START for msg-a, TEXT_MESSAGE_START
  for msg-b, content for msg-a, content for msg-b, END for msg-a, END for msg-b)
- `onStreamEnd` fires for each message that ends (two messages = two calls)
- Dedup: `startAssistantMessage()` followed by `TEXT_MESSAGE_START` with different ID
  associates them correctly (single message, not duplicate)
- Dedup: `startAssistantMessage('id')` followed by `TEXT_MESSAGE_START` with same ID
- `TEXT_MESSAGE_START` without prior `startAssistantMessage()` works and fires `onStreamStart`
- `ensureAssistantMessage` auto-creates message and fires `onStreamStart` when content
  arrives without prior `TEXT_MESSAGE_START`
- Backward compat: `startAssistantMessage()` without `TEXT_MESSAGE_START` still works
- Tool calls routed via `parentMessageId`
- `MESSAGES_SNAPSHOT` hydrates messages and emits `onMessagesChange`
- `MESSAGES_SNAPSHOT` replaces existing messages (not appends)

---

## Step 4: SessionAdapter Interface + DefaultSessionAdapter

**Files**: `packages/typescript/ai-client/src/session-adapter.ts` (new file)

### 4a. Define the `SessionAdapter` interface

```typescript
import type { StreamChunk, UIMessage } from '@tanstack/ai'
import type { ConnectionAdapter } from './connection-adapters'

/**
 * Session adapter interface for persistent stream-based chat sessions.
 *
 * Unlike ConnectionAdapter (which creates a new stream per request),
 * a SessionAdapter maintains a persistent subscription. Responses from
 * send() arrive through subscribe(), not as a return value.
 *
 * The subscribe() stream yields standard AG-UI events (StreamChunk).
 * The processor handles whichever event types it supports — currently
 * text message lifecycle, tool calls, and MESSAGES_SNAPSHOT. Future
 * event handlers (STATE_SNAPSHOT, STATE_DELTA, etc.) are purely additive.
 */
export interface SessionAdapter {
  /**
   * Subscribe to the session stream.
   * Returns an async iterable that yields chunks continuously.
   * For durable sessions, this may first yield a MESSAGES_SNAPSHOT
   * to hydrate the conversation, then subscribe to the live stream
   * from the appropriate offset.
   */
  subscribe(signal?: AbortSignal): AsyncIterable<StreamChunk>

  /**
   * Send messages to the session.
   * For durable sessions, the proxy writes to the stream and forwards to the API.
   * The response arrives through subscribe(), not as a return value.
   */
  send(
    messages: Array<UIMessage>,
    data?: Record<string, any>,
    signal?: AbortSignal,
  ): Promise<void>
}
```

### 4b. Implement `createDefaultSession()`

Wraps a `ConnectionAdapter` into a `SessionAdapter` using an async queue pattern.
`send()` calls `connection.connect()` and pushes chunks to the queue.
`subscribe()` yields chunks from the queue.

```typescript
export function createDefaultSession(
  connection: ConnectionAdapter,
): SessionAdapter {
  // Async queue: send() pushes chunks, subscribe() yields them
  const buffer: Array<StreamChunk> = []
  const waiters: Array<(chunk: StreamChunk | null) => void> = []

  function push(chunk: StreamChunk): void {
    const waiter = waiters.shift()
    if (waiter) {
      waiter(chunk)
    } else {
      buffer.push(chunk)
    }
  }

  return {
    async *subscribe(signal?: AbortSignal) {
      while (!signal?.aborted) {
        let chunk: StreamChunk | null
        if (buffer.length > 0) {
          chunk = buffer.shift()!
        } else {
          chunk = await new Promise<StreamChunk | null>((resolve) => {
            waiters.push(resolve)
            signal?.addEventListener('abort', () => resolve(null), { once: true })
          })
        }
        if (chunk !== null) yield chunk
      }
    },

    async send(messages, data, signal) {
      const stream = connection.connect(messages, data, signal)
      for await (const chunk of stream) {
        push(chunk)
      }
    },
  }
}
```

### 4c. Add tests for DefaultSessionAdapter

- Basic: send text chunks -> subscribe yields them
- Multiple sends: chunks from send #1 then send #2 arrive in order
- Abort: aborting the subscribe signal stops the iterator
- Error: errors in connection.connect() propagate through send()

---

## Step 5: ChatClient Refactor

**Files**: `packages/typescript/ai-client/src/chat-client.ts`

This is the second-largest change. The `streamResponse()` and `processStream()`
methods are removed. All chunk consumption goes through the subscription loop.

### 5a. Update `ChatClientOptions`

In `packages/typescript/ai-client/src/types.ts`:

```typescript
export interface ChatClientOptions<TTools extends ReadonlyArray<AnyClientTool> = any> {
  /**
   * Connection adapter for streaming (request-response mode).
   * Wrapped in a DefaultSessionAdapter internally.
   * Provide either `connection` or `session`, not both.
   */
  connection?: ConnectionAdapter

  /**
   * Session adapter for persistent stream-based sessions.
   * When provided, takes over from connection.
   * Provide either `connection` or `session`, not both.
   */
  session?: SessionAdapter

  // ... rest unchanged
}
```

Note: `connection` changes from required to optional. This is a breaking type
change but existing code providing `connection` still compiles.

### 5b. Update ChatClient constructor

```typescript
constructor(options: ChatClientOptions) {
  // Resolve session adapter
  if (options.session) {
    this.session = options.session
  } else if (options.connection) {
    this.session = createDefaultSession(options.connection)
  } else {
    throw new Error('Either connection or session must be provided')
  }

  // ... existing setup (processor, callbacks, tools) ...

  // Start subscription
  this.startSubscription()
}
```

New instance variables:
```typescript
private session: SessionAdapter
private subscriptionAbortController: AbortController | null = null
```

Remove:
```typescript
private connection: ConnectionAdapter  // replaced by session
```

### 5c. Add `startSubscription()` method

```typescript
private startSubscription(): void {
  this.subscriptionAbortController = new AbortController()
  const signal = this.subscriptionAbortController.signal

  // Run subscription in background (don't await in constructor)
  this.consumeSubscription(signal).catch((err) => {
    if (err instanceof Error && err.name !== 'AbortError') {
      this.setError(err)
      this.setStatus('error')
      this.callbacksRef.current.onError(err)
    }
  })
}

private async consumeSubscription(signal: AbortSignal): Promise<void> {
  const stream = this.session.subscribe(signal)
  for await (const chunk of stream) {
    if (signal.aborted) break
    this.callbacksRef.current.onChunk(chunk)
    this.processor.processChunk(chunk)
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}
```

### 5d. Rewrite `sendMessage()`

Remove the `streamResponse()` call. Instead, send through the session adapter:

```typescript
async sendMessage(content: string | MultimodalContent, body?: Record<string, any>): Promise<void> {
  const emptyMessage = typeof content === 'string' && !content.trim()
  if (emptyMessage || this.isLoading) return

  const normalizedContent = this.normalizeMessageInput(content)
  this.pendingMessageBody = body

  // Add user message optimistically
  const userMessage = this.processor.addUserMessage(
    normalizedContent.content,
    normalizedContent.id,
  )
  this.events.messageSent(userMessage.id, normalizedContent.content)

  // Send through session adapter
  this.setIsLoading(true)
  this.setStatus('submitted')
  this.setError(undefined)

  try {
    const mergedBody = {
      ...this.body,
      ...this.pendingMessageBody,
      conversationId: this.uniqueId,
    }
    this.pendingMessageBody = undefined

    await this.session.send(this.processor.getMessages(), mergedBody)
  } catch (err) {
    if (err instanceof Error) {
      if (err.name === 'AbortError') return
      this.setError(err)
      this.setStatus('error')
      this.callbacksRef.current.onError(err)
    }
    this.setIsLoading(false)
  }
}
```

**Key difference**: `sendMessage` resolves when `session.send()` completes
(HTTP request done), not when the response finishes streaming. The response
arrives through the subscription. `isLoading` is set to false by the processor's
`onStreamEnd` event (wired up in the constructor callbacks).

### 5e. Wire processor events to isLoading

Update the processor event wiring in the constructor:

```typescript
onStreamStart: () => {
  this.setStatus('streaming')
  // In session mode, streaming status already set via sendMessage
},
onStreamEnd: (message: UIMessage) => {
  this.callbacksRef.current.onFinish(message)
  this.setIsLoading(false)  // NEW: reset loading when generation ends
  this.setStatus('ready')

  // Check for continuation (agent loop)
  this.checkForContinuation().catch(console.error)
},
```

### 5f. Rewrite `checkForContinuation()`

```typescript
private async checkForContinuation(): Promise<void> {
  if (this.continuationPending) return
  if (!this.shouldAutoSend()) return

  this.continuationPending = true
  try {
    this.setIsLoading(true)
    this.setStatus('submitted')
    await this.session.send(this.processor.getMessages(), {
      ...this.body,
      conversationId: this.uniqueId,
    })
  } catch (err) {
    if (err instanceof Error && err.name !== 'AbortError') {
      this.setError(err)
      this.setStatus('error')
      this.callbacksRef.current.onError(err)
    }
    this.setIsLoading(false)
  } finally {
    this.continuationPending = false
  }
}
```

### 5g. Simplify `stop()`

```typescript
stop(): void {
  this.subscriptionAbortController?.abort()
  this.subscriptionAbortController = null
  this.setIsLoading(false)
  this.setStatus('ready')
  this.events.stopped()
}
```

### 5h. Update `reload()`

```typescript
async reload(): Promise<void> {
  const messages = this.processor.getMessages()
  if (messages.length === 0) return

  const lastUserMessageIndex = messages.findLastIndex(m => m.role === 'user')
  if (lastUserMessageIndex === -1) return

  this.events.reloaded(lastUserMessageIndex)
  this.processor.removeMessagesAfter(lastUserMessageIndex)

  // Send through session adapter
  this.setIsLoading(true)
  this.setStatus('submitted')
  try {
    await this.session.send(this.processor.getMessages(), {
      ...this.body,
      conversationId: this.uniqueId,
    })
  } catch (err) {
    if (err instanceof Error && err.name !== 'AbortError') {
      this.setError(err)
      this.setStatus('error')
      this.callbacksRef.current.onError(err)
    }
    this.setIsLoading(false)
  }
}
```

### 5i. Update `append()`

```typescript
async append(message: UIMessage | ModelMessage): Promise<void> {
  const normalizedMessage = normalizeToUIMessage(message, generateMessageId)
  if (normalizedMessage.role === 'system') return

  const uiMessage = normalizedMessage as UIMessage
  this.events.messageAppended(uiMessage)

  const messages = this.processor.getMessages()
  this.processor.setMessages([...messages, uiMessage])

  this.setIsLoading(true)
  this.setStatus('submitted')
  try {
    await this.session.send(this.processor.getMessages(), {
      ...this.body,
      conversationId: this.uniqueId,
    })
  } catch (err) {
    if (err instanceof Error && err.name !== 'AbortError') {
      this.setError(err)
      this.setStatus('error')
      this.callbacksRef.current.onError(err)
    }
    this.setIsLoading(false)
  }
}
```

### 5j. Update `updateOptions()`

Replace `connection` with `session`:

```typescript
updateOptions(options: {
  connection?: ConnectionAdapter
  session?: SessionAdapter
  body?: Record<string, any>
  tools?: ReadonlyArray<AnyClientTool>
  // ... callbacks
}): void {
  if (options.session !== undefined) {
    // Stop current subscription, update adapter, restart
    this.subscriptionAbortController?.abort()
    this.session = options.session
    this.startSubscription()
  } else if (options.connection !== undefined) {
    this.subscriptionAbortController?.abort()
    this.session = createDefaultSession(options.connection)
    this.startSubscription()
  }
  // ... rest unchanged
}
```

### 5k. Remove dead code

Delete:
- `streamResponse()` method
- `processStream()` method
- `private connection: ConnectionAdapter` field
- `private abortController: AbortController | null` field (replaced by subscriptionAbortController)
- `private currentStreamId: string | null` field
- `private currentMessageId: string | null` field
- `private postStreamActions` and `drainPostStreamActions()` (no longer needed —
  the subscription loop processes events continuously)
- `queuePostStreamAction()` method

### 5l. Verify

Update `chat-client.test.ts`:
- Existing tests use `createMockConnectionAdapter()` which returns a `ConnectionAdapter`.
  These should still work because the ChatClient wraps it in `createDefaultSession()`.
- The test assertions about message content, callbacks, loading state should mostly
  still pass. Some timing-sensitive tests may need adjustment because `sendMessage`
  now resolves at a different point.
- Add new tests:
  - ChatClient with explicit `session` option
  - Session mode: chunks arrive through subscription
  - Agent loop continuation in session mode

Also update `test-utils.ts`:
- The `createTextChunks` helper should include `TEXT_MESSAGE_START` and
  `TEXT_MESSAGE_END` events to match what real servers emit. This is needed
  because the processor now relies on these events for message creation.
  **Important**: existing tests call `startAssistantMessage()` externally,
  so these events need to work with the dedup logic.

---

## Step 6: Export Updates

**Files**: `packages/typescript/ai-client/src/index.ts`

Add exports:

```typescript
export {
  createDefaultSession,
  type SessionAdapter,
} from './session-adapter'
```

---

## Step 7: Framework Hook Updates

**Files**:
- `packages/typescript/ai-react/src/types.ts`
- `packages/typescript/ai-react/src/use-chat.ts`
- Similarly for `ai-solid`, `ai-vue`, `ai-svelte`, `ai-preact`

### 7a. Update `UseChatOptions`

The `UseChatOptions` type derives from `ChatClientOptions` via `Omit`. Since
`ChatClientOptions` now includes `session?: SessionAdapter`, it flows through
automatically. No change needed in the React types file.

### 7b. Update `useChat` hook

The `useChat` hook passes options to `ChatClient`. Since `session` is now part
of `ChatClientOptions`, it flows through automatically. Verify that:
- `optionsRef.current.session` is passed to the ChatClient constructor
- `updateOptions` propagates session changes

The existing code passes `connection: optionsRef.current.connection` to the
constructor. Update to also pass `session: optionsRef.current.session`.

### 7c. Verify

Run `pnpm test:lib` in `ai-react` and other framework packages. The hook tests
use mock connection adapters, which should still work through the default adapter.

---

## Step 8: Full Test Suite

Run the complete test suite:

```bash
pnpm test:lib        # Unit tests
pnpm test:types      # Type checking
pnpm test:eslint     # Linting
pnpm test:build      # Build verification
pnpm format          # Format code
```

Fix any failures before proceeding.

---

## Step 9: PR Description Artifact

Write the PR description to `docs/proposals/session-stream-pr.md`.

### PR 1: StreamProcessor per-message state + AG-UI alignment

#### Title
`feat(ai): per-message stream state and AG-UI type alignment`

#### Summary
- Refactors StreamProcessor from single-message to per-message state tracking
- Handles `TEXT_MESSAGE_START` / `TEXT_MESSAGE_END` as first-class events
- Adds `MESSAGES_SNAPSHOT` event type and handler for conversation hydration
- Expands `TextMessageStartEvent.role` to support all AG-UI roles
- Adds `parentMessageId` to `ToolCallStartEvent` for message correlation

#### Motivation
Foundation for durable session support. The StreamProcessor needs to:
- Track multiple concurrent messages (interleaved streams)
- Use messageId from incoming events (not generate its own)
- Hydrate conversation state from snapshots (reconnect/resume)

#### Breaking Changes
None. All changes are additive. `startAssistantMessage()` continues to work
via backwards-compatibility dedup logic.

### PR 2: SessionAdapter + ChatClient refactor

#### Title
`feat: session adapter support for durable chat sessions`

#### Summary
- SessionAdapter interface (`subscribe()` / `send()`) for persistent sessions
- DefaultSessionAdapter wraps ConnectionAdapter via async queue
- ChatClient unified refactor: all chunk consumption via subscription loop
- Framework hook updates pass through `session` option

#### Breaking Changes
- `ChatClientOptions.connection` is now optional (was required)
- `sendMessage()` promise resolves when send completes, not when response finishes
- `processStream()` and `streamResponse()` are removed (internal)

#### Migration Guide
- Existing code using `connection:` continues to work unchanged
- To use session mode: provide `session:` instead of `connection:`

#### DX Example

```tsx
import { useChat, fetchServerSentEvents } from '@tanstack/ai-react'

// Existing usage — unchanged
function BasicChat() {
  const { messages } = useChat({
    connection: fetchServerSentEvents('/api/chat'),
  })
}

// New: with a durable session adapter
import { createDurableSession } from '@durable-streams/tanstack'

function DurableChat() {
  const { messages } = useChat({
    session: createDurableSession({
      proxyUrl: PROXY_URL,
      sessionId: 'session-123',
      sendUrl: '/api/chat',
      connectUrl: '/api/connect',
    }),
  })
}
```

---

## Implementation Notes

### Backwards Compatibility — `startAssistantMessage()` + `TEXT_MESSAGE_START`

In the current connection mode, the server (TextEngine) emits `TEXT_MESSAGE_START`
events. Previously these were ignored. Now the processor handles them. But the
`DefaultSessionAdapter` feeds chunks from `connection.connect()` through the
subscription, and the ChatClient no longer calls `startAssistantMessage()`.

For direct `StreamProcessor` users who still call `startAssistantMessage()`:
- `startAssistantMessage()` creates a message and sets `pendingManualMessageId`
- When `TEXT_MESSAGE_START` arrives, the handler checks `pendingManualMessageId`
- If set, it associates the event with the existing message (no duplicate)
- If the messageId differs, update the message's ID

### The DefaultSessionAdapter Async Queue

The queue is a simple producer-consumer pattern (~30 lines). It must handle:
- **Backpressure**: Buffer chunks when subscriber is slower than producer
- **Multiple sends**: Queue chunks from sequential `send()` calls correctly
- **Abort**: Resolve waiting promises with null on abort signal
- **No memory leaks**: Don't accumulate waiters after abort

### `sendMessage` Promise Semantics

In connection mode (via DefaultSessionAdapter), `session.send()` awaits the full
`connection.connect()` iteration. So `sendMessage()` resolves when all chunks
have been pushed to the queue (similar to current timing, though finalization
happens asynchronously in the subscription loop).

In durable session mode, `session.send()` resolves when the HTTP request to the
proxy completes. The actual response streams through the subscription.

### `isLoading` Management

`isLoading` is set true in `sendMessage()` / `checkForContinuation()` / `reload()`.
It is set false in the processor's `onStreamEnd` callback, which fires when
`TEXT_MESSAGE_END` or `RUN_FINISHED` is processed.

Edge case: if `send()` fails (error thrown), `isLoading` is set false in the
catch block.

### DevTools Events

The current devtools integration uses `currentStreamId` and `currentMessageId`
which are set in `processStream()`. Since `processStream()` is removed, devtools
events need to be wired differently — either from the subscription loop or from
processor events. This may need a follow-up if devtools integration breaks.

---

## Extensibility: Session State

The SessionAdapter interface returns `AsyncIterable<StreamChunk>` where
`StreamChunk = AGUIEvent`. This already includes `STATE_SNAPSHOT`, `STATE_DELTA`,
and `CUSTOM` events in the union type. The transport layer is fully extensible —
any session implementation can emit these events and they flow through the
subscription.

Adding support for new event types is purely additive: a new `case` branch in
`processChunk()`. The SessionAdapter interface does not change.

### Planned: Managed `sessionState` container (future PR)

Based on analysis of the AG-UI spec and real-world use cases (user presence,
agent registration, typing indicators, session metadata), the recommended
approach is a managed state container in the ChatClient:

1. **`STATE_SNAPSHOT` handler** — store full state object, extract messages if present
2. **`STATE_DELTA` handler** — apply delta (shallow merge initially, JSON Patch later)
3. **`onSessionStateChange` callback** — in `ChatClientOptions` and `StreamProcessorEvents`
4. **`getSessionState()` getter** — on ChatClient
5. **`sessionState` in framework hooks** — as reactive state

This is "Proposal A" from the session state extensibility analysis. It adds:
- One new callback (`onSessionStateChange`)
- One new getter (`getSessionState()`)
- One new piece of reactive state in hooks (`sessionState`)

Users who don't use session state pay zero cost. The `Record<string, unknown>`
type can later be made generic if demand warrants it.

Additionally, an `onCustomEvent` callback can forward `CUSTOM` events for
application-specific functionality (typing indicators, participant events, etc.)
without overloading `STATE_SNAPSHOT`.

### Event support roadmap

| Event | PR 1 (this PR) | PR 2 (SessionAdapter) | Future PR |
|-------|----------------|----------------------|-----------|
| `TEXT_MESSAGE_START/CONTENT/END` | Handled | — | — |
| `TOOL_CALL_START/ARGS/END` | Handled | — | — |
| `RUN_STARTED/FINISHED/ERROR` | Handled | — | — |
| `STEP_STARTED/FINISHED` | Handled | — | — |
| `CUSTOM` (tool-input, approval) | Handled | — | — |
| `MESSAGES_SNAPSHOT` | Handled | — | — |
| `STATE_SNAPSHOT` | No-op (falls through) | No-op | Managed sessionState |
| `STATE_DELTA` | No-op (falls through) | No-op | Managed sessionState |
| `CUSTOM` (general callback) | — | — | `onCustomEvent` |

---

## Out of Scope (Follow-up PRs)

- `@durable-streams/tanstack` package (the `createDurableSession()` implementation)
- Server-side changes to TextEngine for session mode
- Per-message `isLoading` tracking (currently global)
- `connectUrl` / snapshot / offset mechanics (lives in durable streams package)
- `STATE_SNAPSHOT` / `STATE_DELTA` processing (managed sessionState — see above)
- `onSessionStateChange` / `onCustomEvent` callbacks
- `sessionState` reactive state in framework hooks
- Documentation updates
- Example app using session mode
