# Chat Stream Architecture

> **Canonical reference for AG-UI chunk processing.**
> The `StreamProcessor` class cross-references sections of this document.
> When modifying stream handling behavior, update this document first, then code.

---

## Table of Contents

1. [System Overview](#system-overview)
2. [Single-Shot Text Response](#single-shot-text-response)
3. [Single-Shot Tool Call Response](#single-shot-tool-call-response)
4. [Parallel Tool Calls (Single Shot)](#parallel-tool-calls-single-shot)
5. [Text-Then-Tool Interleaving (Single Shot)](#text-then-tool-interleaving-single-shot)
6. [Thinking/Reasoning Content](#thinkingreasoning-content)
7. [Tool Results and the TOOL_CALL_END Dual Role](#tool-results-and-the-tool_call_end-dual-role)
8. [Client Tools and Approval Flows](#client-tools-and-approval-flows)
9. [Multi-Iteration Agent Loop](#multi-iteration-agent-loop)
10. [Adapter Contract](#adapter-contract)
11. [StreamProcessor Internal State](#streamprocessor-internal-state)
12. [UIMessage Part Ordering Invariants](#uimessage-part-ordering-invariants)
13. [Testing Strategy](#testing-strategy)

---

## System Overview

```
┌──────────────────────────────────────────────────────────────┐
│                        chat() function                       │
│                                                              │
│   ┌────────────┐    AG-UI events     ┌──────────────────┐    │
│   │   Adapter  │ ──────────────────> │   TextEngine     │    │
│   │ (provider) │                     │ (agent loop)     │    │
│   └────────────┘                     └────────┬─────────┘    │
│                                               │              │
│                                       yield AG-UI events     │
│                                               │              │
└───────────────────────────────────────────────┼──────────────┘
                                                │
                                                v
                                      ┌──────────────────┐
                                      │ StreamProcessor  │
                                      │ (UI state owner) │
                                      └──────────────────┘
                                                │
                                                v
                                        UIMessage[] updates
                                       (onMessagesChange)
```

Two components consume the AG-UI event stream:

- **TextEngine** (server, `chat/index.ts`) -- Orchestrates the agent loop. Accumulates text and tool calls for its own bookkeeping, decides whether to execute tools and re-invoke the adapter. Yields all events downstream.
- **StreamProcessor** (client, `chat/stream/processor.ts`) -- The single source of truth for `UIMessage[]` state. Consumes AG-UI events and maintains the conversation as an array of `UIMessage` objects with typed parts.

Both trust the adapter to emit events in the correct order. The processor does **not** attempt error recovery for out-of-order events.

---

## Single-Shot Text Response

The simplest possible flow. The model returns text with no tool calls.

### Required chunk sequence from the adapter

```
#   Event                  Required Fields                        Notes
──  ─────────────────────  ─────────────────────────────────────  ──────────────────────────────────────────
1   RUN_STARTED            runId                                  MUST be first event
2   TEXT_MESSAGE_START      messageId, role: "assistant"           MUST precede any TEXT_MESSAGE_CONTENT
3   TEXT_MESSAGE_CONTENT    messageId, delta: "Hello"              One per token; delta is the increment
4   TEXT_MESSAGE_CONTENT    messageId, delta: " world"             Appended to previous
5   TEXT_MESSAGE_CONTENT    messageId, delta: "!"                  ...
6   TEXT_MESSAGE_END        messageId                              Signals text segment complete
7   RUN_FINISHED           runId, finishReason: "stop"            MUST be last meaningful event
```

### Processor behavior, step by step

| # | Chunk received | Processor action | State change |
|---|---|---|---|
| 1 | `RUN_STARTED` | **Ignored.** No handler. | (none) |
| 2 | `TEXT_MESSAGE_START` | `handleTextMessageStartEvent()`: Flushes any pending text from a prior segment, then resets `currentSegmentText = ""` and `lastEmittedText = ""`. | Segment accumulators reset. |
| 3 | `TEXT_MESSAGE_CONTENT` | `handleTextMessageContentEvent()`: Calls `ensureAssistantMessage()` (lazily creates the assistant UIMessage on first content chunk). Appends `delta` to both `currentSegmentText` and `totalTextContent`. Chunk strategy decides emission. `emitTextUpdate()` calls `updateTextPart()` which: if last part is TextPart, replaces its content; otherwise appends a new TextPart. | UIMessage created, parts: `[{ type: "text", content: "Hello" }]` |
| 4 | `TEXT_MESSAGE_CONTENT` | Same as above. `currentSegmentText` is now `"Hello world"`. `updateTextPart()` replaces the last TextPart. | parts: `[{ type: "text", content: "Hello world" }]` |
| 5 | `TEXT_MESSAGE_CONTENT` | Same. | parts: `[{ type: "text", content: "Hello world!" }]` |
| 6 | `TEXT_MESSAGE_END` | **Ignored.** No handler. | (none) |
| 7 | `RUN_FINISHED` | `handleRunFinishedEvent()`: Sets `finishReason = "stop"`, `isDone = true`. Calls `completeAllToolCalls()` (no-op, no tool calls). | Done. |
| — | Stream ends | `finalizeStream()`: Calls `completeAllToolCalls()` (no-op). Flushes any pending text. Fires `onStreamEnd`. | Final. |

### Key invariant

> **`updateTextPart()` appends vs. replaces based on the last part's type.**
> If the last part is `type: "text"`, its content is *replaced* (not appended to).
> If the last part is anything else (tool-call, tool-result, thinking), a *new* TextPart is pushed.
> This is how multi-segment text (text before and after tool calls) works.

### Final UIMessage

```typescript
{
  id: "msg-...",
  role: "assistant",
  parts: [
    { type: "text", content: "Hello world!" }
  ]
}
```

---

## Single-Shot Tool Call Response

The model returns text AND one tool call. This is the most common source of bugs because the tool call events are interleaved with text events in a single stream.

### Required chunk sequence from the adapter

```
#    Event                  Required Fields                                     Notes
───  ─────────────────────  ──────────────────────────────────────────────────  ──────────────────────────────────────────────────
1    RUN_STARTED            runId                                               First event
2    TEXT_MESSAGE_START     messageId, role: "assistant"                        Before any text content
3    TEXT_MESSAGE_CONTENT   messageId, delta: "Let me check."                   Text before tool call
4    TEXT_MESSAGE_END       messageId                                           Text segment done
5    TOOL_CALL_START        toolCallId: "call_1", toolName: "getWeather"        MUST have toolCallId + toolName
6    TOOL_CALL_ARGS         toolCallId: "call_1", delta: '{"city":'             Incremental JSON string
7    TOOL_CALL_ARGS         toolCallId: "call_1", delta: '"NYC"}'               More JSON
8    TOOL_CALL_END          toolCallId: "call_1", toolName: "getWeather"        Signals arguments finalized
9    RUN_FINISHED           runId, finishReason: "tool_calls"                   MUST be "tool_calls" when tools requested
```

### Critical ordering rules

1. **`TOOL_CALL_START` MUST precede any `TOOL_CALL_ARGS` for the same `toolCallId`.**
   The processor creates internal state (`InternalToolCallState`) in the `toolCalls` Map on `TOOL_CALL_START`. If `TOOL_CALL_ARGS` arrives for an unknown `toolCallId`, the args are **silently dropped** (the `existingToolCall` lookup fails).

2. **`TOOL_CALL_END` MUST come after all `TOOL_CALL_ARGS` for that `toolCallId`.**
   `TOOL_CALL_END` transitions the tool call to `input-complete` state and does a final JSON parse of accumulated arguments. Any `TOOL_CALL_ARGS` after `TOOL_CALL_END` for the same ID will still be processed (appending to arguments), but the state has already been set to `input-complete`.

3. **`RUN_FINISHED` with `finishReason: "tool_calls"` MUST come last.**
   The TextEngine uses this to decide whether to enter the tool execution phase. The StreamProcessor uses it as a signal to force-complete any tool calls still not in `input-complete` state (safety net).

4. **Text events and tool call events can interleave**, but within each tool call the order MUST be: `START -> ARGS* -> END`.

### Processor behavior, step by step

| # | Chunk | Processor action | UIMessage parts after |
|---|---|---|---|
| 1 | `RUN_STARTED` | Ignored. | `[]` |
| 2 | `TEXT_MESSAGE_START` | Resets segment accumulators. | `[]` |
| 3 | `TEXT_MESSAGE_CONTENT` | `ensureAssistantMessage()` creates UIMessage. Appends delta. `updateTextPart()` creates TextPart. | `[text: "Let me check."]` |
| 4 | `TEXT_MESSAGE_END` | Ignored. | `[text: "Let me check."]` |
| 5 | `TOOL_CALL_START` | `ensureAssistantMessage()` (already exists). Creates `InternalToolCallState` in Map with `state: "awaiting-input"`. `updateToolCallPart()` appends a ToolCallPart. | `[text: "Let me check.", tool-call(call_1, awaiting-input, args: "")]` |
| 6 | `TOOL_CALL_ARGS` | Appends delta to `arguments`. State transitions `awaiting-input -> input-streaming`. `updateToolCallPart()` updates existing ToolCallPart by ID. | `[text: "Let me check.", tool-call(call_1, input-streaming, args: '{"city":')]` |
| 7 | `TOOL_CALL_ARGS` | Appends delta. Stays `input-streaming`. Arguments now complete. | `[text: "Let me check.", tool-call(call_1, input-streaming, args: '{"city":"NYC"}')]` |
| 8 | `TOOL_CALL_END` | `completeToolCall()`: Sets `state: "input-complete"`. Does final JSON parse. No `result` field, so no tool-result part created. | `[text: "Let me check.", tool-call(call_1, input-complete, args: '{"city":"NYC"}')]` |
| 9 | `RUN_FINISHED` | Sets `finishReason = "tool_calls"`. `completeAllToolCalls()`: iterates all tool calls; `call_1` already `input-complete`, so no-op. | Same as above. |
| — | Stream ends | `finalizeStream()`: Flushes pending text (already emitted). Fires `onStreamEnd`. | Final. |

### Tool call state transitions

```
TOOL_CALL_START received     →  state: "awaiting-input"      (created in Map + UIMessage)
First TOOL_CALL_ARGS         →  state: "input-streaming"     (only if delta is non-empty)
Subsequent TOOL_CALL_ARGS    →  state: "input-streaming"     (no change, args accumulate)
TOOL_CALL_END received       →  state: "input-complete"      (final parse, authoritative)
  OR
RUN_FINISHED received        →  state: "input-complete"      (safety net via completeAllToolCalls)
```

### What the processor does NOT do at this stage

- It does **not** execute the tool. That's the TextEngine's job.
- It does **not** create a `tool-result` part. That happens later when `TOOL_CALL_END` arrives WITH a `result` field (from TextEngine after execution).
- It does **not** validate that `toolName` matches a known tool. The processor is tool-definition-agnostic.

---

## Parallel Tool Calls (Single Shot)

The model requests multiple tools in one response. Adapters may interleave the events.

### Required chunk sequence (interleaved)

```
#    Event                  Key Fields
───  ─────────────────────  ──────────────────────────────────────────
1    RUN_STARTED            runId
2    TOOL_CALL_START        toolCallId: "call_1", toolName: "getWeather", index: 0
3    TOOL_CALL_START        toolCallId: "call_2", toolName: "getTime", index: 1
4    TOOL_CALL_ARGS         toolCallId: "call_1", delta: '{"city":"NYC"}'
5    TOOL_CALL_ARGS         toolCallId: "call_2", delta: '{"tz":"EST"}'
6    TOOL_CALL_END          toolCallId: "call_1", toolName: "getWeather"
7    TOOL_CALL_END          toolCallId: "call_2", toolName: "getTime"
8    RUN_FINISHED           finishReason: "tool_calls"
```

### Alternative valid ordering (sequential)

```
TOOL_CALL_START  call_1
TOOL_CALL_ARGS   call_1
TOOL_CALL_END    call_1
TOOL_CALL_START  call_2
TOOL_CALL_ARGS   call_2
TOOL_CALL_END    call_2
RUN_FINISHED
```

Both orderings are valid. The processor tracks tool calls by `toolCallId` in a `Map`, not by position. The `index` field on `TOOL_CALL_START` is stored for reference but the Map key is always `toolCallId`.

### Processor guarantees

- Each `TOOL_CALL_START` creates a new entry in the Map. Duplicate `toolCallId` on a second `TOOL_CALL_START` is a no-op (the `if (!existingToolCall)` guard).
- `TOOL_CALL_ARGS` finds its tool call by `toolCallId`. If the ID is unknown, the event is silently dropped.
- `TOOL_CALL_END` finds its tool call by `toolCallId`. If already `input-complete`, it's a no-op (the state guard).
- `RUN_FINISHED` with `completeAllToolCalls()` force-completes any tool call not yet `input-complete`.

### Final UIMessage parts

```typescript
[
  { type: "tool-call", id: "call_1", name: "getWeather", arguments: '{"city":"NYC"}', state: "input-complete" },
  { type: "tool-call", id: "call_2", name: "getTime", arguments: '{"tz":"EST"}', state: "input-complete" },
]
```

Parts are ordered by when `TOOL_CALL_START` was first received, since `updateToolCallPart()` appends new parts at the end.

---

## Text-Then-Tool Interleaving (Single Shot)

A response with text, then a tool call, then the tool result comes back, then more text. This tests the multi-segment text logic.

### Chunk sequence (first adapter call + TextEngine tool result + second adapter call)

```
── First adapter stream ──────────────────────────────────
1    RUN_STARTED
2    TEXT_MESSAGE_START      messageId: "m1"
3    TEXT_MESSAGE_CONTENT    delta: "Checking weather..."
4    TEXT_MESSAGE_END
5    TOOL_CALL_START        toolCallId: "call_1", toolName: "getWeather"
6    TOOL_CALL_ARGS         toolCallId: "call_1", delta: '{"city":"NYC"}'
7    TOOL_CALL_END          toolCallId: "call_1"
8    RUN_FINISHED           finishReason: "tool_calls"

── TextEngine executes tool, yields result ──────────────
9    TOOL_CALL_END          toolCallId: "call_1", result: '{"temp":"72F"}'

── Second adapter stream ─────────────────────────────────
10   TEXT_MESSAGE_START      messageId: "m2"
11   TEXT_MESSAGE_CONTENT    delta: "It's 72°F in NYC."
12   TEXT_MESSAGE_END
13   RUN_FINISHED           finishReason: "stop"
```

### Critical: TEXT_MESSAGE_START resets the text segment

At step 10, `handleTextMessageStartEvent()`:
- Flushes any pending text from the previous segment.
- Resets `currentSegmentText = ""` and `lastEmittedText = ""`.

This means the next `TEXT_MESSAGE_CONTENT` (step 11) starts accumulating into a fresh segment. When `emitTextUpdate()` is called, `updateTextPart()` sees the last part is a `tool-result` (not text), so it **pushes a new TextPart** rather than replacing.

### UIMessage parts progression

```
After step 3:  [text: "Checking weather..."]
After step 5:  [text: "Checking weather...", tool-call(call_1, awaiting-input)]
After step 7:  [text: "Checking weather...", tool-call(call_1, input-complete)]
After step 9:  [text: "Checking weather...", tool-call(call_1, input-complete, output: {...}), tool-result(call_1, complete)]
After step 11: [text: "Checking weather...", tool-call(call_1, ...), tool-result(call_1, ...), text: "It's 72°F in NYC."]
```

Note: **two separate TextParts** in the final message. This preserves the interleaving for accurate round-trip conversion to ModelMessages.

---

## Thinking/Reasoning Content

### Chunk sequence

```
1    RUN_STARTED
2    STEP_STARTED           stepId, stepType: "thinking"       (informational, ignored by processor)
3    STEP_FINISHED          stepId, delta: "Let me think"
4    STEP_FINISHED          stepId, delta: " about this..."
5    TEXT_MESSAGE_START
6    TEXT_MESSAGE_CONTENT    delta: "Here's my answer."
7    TEXT_MESSAGE_END
8    RUN_FINISHED           finishReason: "stop"
```

### Processor behavior

- `STEP_STARTED` -- Ignored (no handler).
- `STEP_FINISHED` -- `handleStepFinishedEvent()`: Calls `ensureAssistantMessage()`. Appends `delta` to `thinkingContent`. `updateThinkingPart()` either updates existing ThinkingPart or pushes a new one. Always **replaces** (not accumulates) -- the full `thinkingContent` string is set.

### Final UIMessage parts

```typescript
[
  { type: "thinking", content: "Let me think about this..." },
  { type: "text", content: "Here's my answer." }
]
```

---

## Tool Results and the TOOL_CALL_END Dual Role

`TOOL_CALL_END` serves two purposes depending on whether `result` is present:

### Without `result` (from adapter)

Signals that the tool call's **input arguments** are finalized.
- Transitions state to `input-complete`.
- Does final JSON parse of accumulated arguments.
- If `input` field is provided, uses it as canonical parsed arguments.
- **No tool-result part is created.**

### With `result` (from TextEngine after execution)

Signals that the tool has been **executed** and the result is available.
- Still transitions state to `input-complete` (if not already).
- Creates/updates two things:
  1. `updateToolCallWithOutput()` -- Sets `output` on the tool-call part (for UI rendering consistency).
  2. `updateToolResultPart()` -- Creates a `tool-result` part (for LLM conversation history).
- The `result` field is a JSON string.

### This distinction is critical

Adapters emit `TOOL_CALL_END` **without** `result` -- they're signaling "arguments are done."
The TextEngine emits `TOOL_CALL_END` **with** `result` -- it's signaling "tool was executed, here's the output."

If an adapter incorrectly includes `result`, the processor will store it as a tool-result part immediately, which may cause unexpected behavior in the agent loop.

---

## Client Tools and Approval Flows

These are handled via `CUSTOM` events emitted by the TextEngine (not the adapter).

### Client tool flow

```
CUSTOM { name: "tool-input-available", data: { toolCallId, toolName, input } }
```

Processor action: Fires `onToolCall` callback. Client calls `addToolResult(toolCallId, output)`.

### Approval flow

```
CUSTOM { name: "approval-requested", data: { toolCallId, toolName, input, approval: { id, needsApproval: true } } }
```

Processor action:
1. `updateToolCallApproval()` -- Sets `state: "approval-requested"` and adds `approval` metadata to tool-call part.
2. Fires `onApprovalRequest` callback.
3. Client calls `addToolApprovalResponse(approvalId, true/false)`.
4. `updateToolCallApprovalResponse()` -- Sets `state: "approval-responded"` and `approval.approved`.

---

## Multi-Iteration Agent Loop

The TextEngine may call the adapter multiple times within a single `chat()` call (when tools are involved).

### Iteration cycle

```
do {
  processText:      Call adapter.chatStream(), yield events, accumulate tool calls
  executeToolCalls: If finishReason == "tool_calls", execute tools, yield TOOL_CALL_END with results
} while (agentLoopStrategy says continue)
```

### What the StreamProcessor sees

The processor receives a **single flat stream** of AG-UI events from all iterations. It does not know about iterations. Each `TEXT_MESSAGE_START` resets its text segment accumulator, which is how multi-iteration text works correctly.

### StreamProcessor.process() vs manual processChunk()

- `process(stream)` -- Consumes the entire async iterable, calls `processChunk()` for each event, then `finalizeStream()`. Used for simple consumption.
- `processChunk(chunk)` -- Processes a single event. Used when the consumer needs to interleave its own logic (e.g., the client framework integration).

---

## Adapter Contract

### Mandatory events and ordering

Every adapter `chatStream()` implementation MUST emit events in this order:

```
RUN_STARTED                                     ← exactly once, first
  (TEXT_MESSAGE_START                           ← before any text content
    TEXT_MESSAGE_CONTENT*                       ← zero or more text deltas
  TEXT_MESSAGE_END)?                            ← if text was started
  (TOOL_CALL_START                              ← before any args for this tool
    TOOL_CALL_ARGS*                             ← zero or more arg deltas
  TOOL_CALL_END)?                               ← for each tool call
RUN_FINISHED | RUN_ERROR                        ← exactly once, last
```

In EBNF-like notation:

```
Stream        ::= RUN_STARTED Content* Terminal
Content       ::= TextBlock | ToolCall | ThinkingBlock
TextBlock     ::= TEXT_MESSAGE_START TEXT_MESSAGE_CONTENT* TEXT_MESSAGE_END
ToolCall      ::= TOOL_CALL_START TOOL_CALL_ARGS* TOOL_CALL_END
ThinkingBlock ::= STEP_STARTED? STEP_FINISHED+
Terminal      ::= RUN_FINISHED | RUN_ERROR
```

### Event field requirements

#### RUN_STARTED
- `runId: string` -- Unique run identifier.

#### TEXT_MESSAGE_START
- `messageId: string` -- Unique message identifier.
- `role: "assistant"` -- Always assistant for generated messages.

#### TEXT_MESSAGE_CONTENT
- `messageId: string` -- Must match the preceding TEXT_MESSAGE_START.
- `delta: string` -- **Non-empty** incremental text token.
- `content?: string` -- (Optional) Full accumulated text. For debugging only; processor uses `delta`.

#### TEXT_MESSAGE_END
- `messageId: string` -- Must match.

#### TOOL_CALL_START
- `toolCallId: string` -- **Globally unique** within this stream. The processor uses this as a Map key.
- `toolName: string` -- Name of the tool being called. Must not be empty.
- `index?: number` -- (Optional) For parallel tool calls. Defaults to `toolCalls.size` (order of arrival).

#### TOOL_CALL_ARGS
- `toolCallId: string` -- Must match a preceding TOOL_CALL_START.
- `delta: string` -- Incremental JSON argument fragment. Concatenated by the processor.

#### TOOL_CALL_END
- `toolCallId: string` -- Must match.
- `toolName: string` -- Must match.
- `input?: unknown` -- (Optional) Parsed arguments. If provided, overrides the processor's accumulated string parse.
- `result?: string` -- (Optional) **Adapters MUST NOT set this.** Reserved for TextEngine tool execution results.

#### RUN_FINISHED
- `runId: string` -- Must match RUN_STARTED.
- `finishReason: "stop" | "length" | "content_filter" | "tool_calls" | null`
  - `"tool_calls"` -- The model wants tool execution. TextEngine will enter tool phase.
  - `"stop"` -- Normal completion. TextEngine exits loop.
  - Other values are informational.
- `usage?: { promptTokens, completionTokens, totalTokens }` -- (Optional) Token usage.

#### RUN_ERROR
- `error: { message: string, code?: string }` -- Error details.

#### STEP_FINISHED (thinking)
- `stepId: string` -- Step identifier.
- `delta: string` -- Incremental thinking content.
- `content?: string` -- (Optional) Full accumulated thinking.

### What adapters MUST NOT do

1. **Do not emit `TOOL_CALL_ARGS` before `TOOL_CALL_START` for the same `toolCallId`.** The processor will silently drop the args (no entry in the Map).

2. **Do not emit `TOOL_CALL_END` with a `result` field.** This field is reserved for the TextEngine. If an adapter sets it, the processor will immediately create a tool-result part, corrupting the agent loop flow.

3. **Do not omit `RUN_FINISHED`.** Without it, the TextEngine cannot determine whether to execute tools. The StreamProcessor's `finalizeStream()` will force-complete tool calls as a safety net, but this is a fallback for network errors -- not normal operation.

4. **Do not emit `TEXT_MESSAGE_CONTENT` without a preceding `TEXT_MESSAGE_START`.** The text will still be processed (the processor doesn't validate this), but `TEXT_MESSAGE_START` is needed to reset the segment accumulator for correct multi-segment text after tool calls.

5. **Do not use empty strings for `toolCallId` or `toolName`.** The `ToolCallManager.getToolCalls()` filters out entries where `name.trim().length === 0`.

6. **Do not reuse `toolCallId` values within a single stream.** The processor's Map deduplicates by ID -- a second `TOOL_CALL_START` with the same ID is silently ignored.

### What adapters SHOULD do (recommended)

1. Provide `TOOL_CALL_END.input` with parsed arguments. This gives the processor an authoritative parse rather than relying on partial-JSON parsing of accumulated deltas.

2. Provide `TEXT_MESSAGE_CONTENT.content` with accumulated text. Useful for debugging, but the processor always uses `delta` for accumulation.

3. Use deterministic `toolCallId` values from the provider (e.g., OpenAI's `call_*` IDs) rather than generating random ones, to enable debugging and replay.

---

## StreamProcessor Internal State

### Stream-scoped state (reset per `process()` or `prepareAssistantMessage()`)

| Field | Type | Purpose |
|---|---|---|
| `totalTextContent` | `string` | All text across all segments (for `ProcessorResult.content`) |
| `currentSegmentText` | `string` | Text in the current segment (reset on `TEXT_MESSAGE_START`) |
| `lastEmittedText` | `string` | Last text sent to `updateTextPart()` (prevents duplicate emissions) |
| `thinkingContent` | `string` | Accumulated thinking text |
| `toolCalls` | `Map<string, InternalToolCallState>` | Active tool calls keyed by `toolCallId` |
| `toolCallOrder` | `string[]` | Order in which tool calls were first seen |
| `finishReason` | `string \| null` | From `RUN_FINISHED` |
| `isDone` | `boolean` | Set by `RUN_FINISHED` |

### Conversation-scoped state (persists across streams)

| Field | Type | Purpose |
|---|---|---|
| `messages` | `UIMessage[]` | The full conversation |
| `currentAssistantMessageId` | `string \| null` | ID of the message being streamed (null before first content) |

### The lazy message creation pattern

The assistant UIMessage is **not** created when `prepareAssistantMessage()` is called. It's created lazily by `ensureAssistantMessage()` on the first content-bearing chunk. This prevents empty assistant messages from appearing in the UI during auto-continuation iterations that produce no content.

Content-bearing chunks that trigger `ensureAssistantMessage()`:
- `TEXT_MESSAGE_CONTENT`
- `TOOL_CALL_START`
- `STEP_FINISHED`
- `RUN_ERROR`

---

## UIMessage Part Ordering Invariants

The parts array within a single assistant UIMessage maintains a strict ordering that mirrors the stream:

1. **ThinkingPart** (if present) -- Always managed as a single part, updated in place.
2. **TextPart** (first segment) -- Created on first text content.
3. **ToolCallPart(s)** -- Appended when tool calls start.
4. **ToolResultPart(s)** -- Appended when tool results arrive.
5. **TextPart** (second segment) -- Created when text resumes after tool calls.

The critical logic is in `updateTextPart()`:
- If the **last** part is a TextPart → **replace** its content (same segment continues).
- If the **last** part is anything else → **push** a new TextPart (new segment after tools).

This means tool-call and tool-result parts act as "segment separators" for text content.

### Round-trip fidelity

This ordering is preserved through `uiMessageToModelMessages()` which walks parts in order and flushes assistant segments at tool-result boundaries. See `messages.ts` for the conversion logic.

---

## Testing Strategy

The StreamProcessor should be tested with recorded chunk sequences covering:

### Single-shot scenarios (no agent loop)

1. **Text only** -- `RUN_STARTED → TEXT_MESSAGE_START → TEXT_MESSAGE_CONTENT* → TEXT_MESSAGE_END → RUN_FINISHED(stop)`
2. **Tool call only (no text)** -- `RUN_STARTED → TOOL_CALL_START → TOOL_CALL_ARGS* → TOOL_CALL_END → RUN_FINISHED(tool_calls)`
3. **Text then tool call** -- Text block followed by tool call block.
4. **Parallel tool calls** -- Multiple interleaved TOOL_CALL_START/ARGS/END sequences.
5. **Empty text deltas** -- Verify empty `delta` in `TOOL_CALL_ARGS` doesn't transition from `awaiting-input`.
6. **Missing TOOL_CALL_END** -- Verify `RUN_FINISHED` safety net completes the tool call.
7. **TOOL_CALL_END with input override** -- Verify `input` field overrides accumulated parse.
8. **Thinking then text** -- STEP_FINISHED events followed by text events.

### Tool result scenarios

9. **TOOL_CALL_END with result** -- Verify both `output` on tool-call part and `tool-result` part are created.
10. **Client tool via CUSTOM** -- Verify `onToolCall` fires, then `addToolResult()` creates correct parts.
11. **Approval flow** -- Verify state transitions: `input-complete → approval-requested → approval-responded`.

### Multi-segment text

12. **Text → tool → text** -- Verify two separate TextParts with TEXT_MESSAGE_START reset.
13. **Text → tool → result → text** -- Verify parts order: text, tool-call, tool-result, text.

### Edge cases

14. **No content (empty stream)** -- Only `RUN_STARTED` + `RUN_FINISHED`. No assistant message created.
15. **RUN_ERROR** -- Verify assistant message is created and `onError` fires.
16. **Duplicate TOOL_CALL_START** (same ID) -- Verify it's a no-op.
17. **TOOL_CALL_ARGS for unknown ID** -- Verify silently dropped.

Each test should assert:
- The final `UIMessage.parts` array matches expected types, order, and content.
- The `ProcessorResult` has correct `content`, `toolCalls`, and `finishReason`.
- `onMessagesChange` was called the expected number of times.
- Granular events (`onTextUpdate`, `onToolCallStateChange`) fired with correct arguments.
