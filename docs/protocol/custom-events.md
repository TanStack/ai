---
title: Custom Events Reference
id: custom-events
order: 1
description: "Every CUSTOM event TanStack AI itself emits, unified as KnownCustomEvent, and the ChatStream type that lets a plain `if (chunk.name === '…')` narrow chunk.value — no helper, no cast."
keywords:
  - tanstack ai
  - custom events
  - KnownCustomEvent
  - ChatStream
  - ag-ui protocol
  - CUSTOM event
  - stream narrowing
---

You're reading a `chat()` stream and you've hit a `CUSTOM` event — maybe
[`sandbox.file.diff`](../sandbox/events), maybe a Code Mode progress event,
maybe `structured-output.complete`. Each feature page documents its own
events in context. This page is the map: every `CUSTOM` event TanStack AI
itself emits, in one table, plus the type mechanism that lets you read any of
them with a plain `if` — no helper function, no cast.

## The type: `ChatStream`

`chat()` returns `ChatStream` by default (no `outputSchema`, `stream` not
explicitly `false`):

```ts
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import type { ChatStream } from "@tanstack/ai";

const stream: ChatStream = chat({
  adapter: openaiText("gpt-5.5"),
  messages: [{ role: "user", content: "Hello" }],
});
```

`ChatStream` is defined as:

```ts ignore
type ChatStream = AsyncIterable<Exclude<StreamChunk, CustomEvent> | KnownCustomEvent>
```

`StreamChunk` (the raw AG-UI event union) has exactly one `CUSTOM`-shaped
member: the generic `CustomEvent` interface, with `name: string` and
`value: any`. Left in the union unchanged, that single `any` "poisons" every
narrow — even `if (chunk.type === 'CUSTOM' && chunk.name === 'sandbox.file')`
would still leave `chunk.value` typed `any`, because TypeScript can't
distinguish the generic member from a specific one once they're merged.
`ChatStream` fixes this in two steps: `Exclude<StreamChunk, CustomEvent>`
removes that generic member, and `| KnownCustomEvent` adds back a
discriminated union of every event TanStack AI actually emits — each with a
literal `name` and a concrete `value`. The result is a stream where `CUSTOM`
events narrow like anything else.

## Reading events: the plain narrowing pattern

Check `chunk.type === 'CUSTOM'`, then compare `chunk.name` to a literal
string. That's the entire client-side API — there is no `isCustomEvent` or
`isSandboxEvent` guard to import:

```ts ignore
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiText("gpt-5.5"),
  messages: [{ role: "user", content: "Hello" }],
});

for await (const chunk of stream) {
  if (chunk.type === "CUSTOM" && chunk.name === "sandbox.file.diff") {
    console.log(chunk.value.path, chunk.value.diff); // typed, no helper, no cast
  } else if (chunk.type === "CUSTOM" && chunk.name === "structured-output.complete") {
    console.log(chunk.value.object); // typed, no helper, no cast
  }
}
```

## Full taxonomy

Every interface below extends the base `CustomEvent` (`type: 'CUSTOM'`, plus
an optional `model?`) with a literal `name` and a concrete `value`. All are
unioned as `KnownCustomEvent`, exported from `@tanstack/ai` alongside each
individual interface.

| Interface | `name` | `value` | Emitted when |
| --- | --- | --- | --- |
| `SandboxFileCustomEvent` | `sandbox.file` | `{ type: 'create' \| 'change' \| 'delete'; path: string; timestamp: number }` | per file create/change/delete in an active [sandbox](../sandbox/events) |
| `SandboxFileDiffEvent` | `sandbox.file.diff` | `{ path: string; diff: string }` | per file change, opt-in via `fileEvents: { diff: true }` |
| `FileChangedEvent` | `file.changed` | `{ path: string; diff: string }` | a harness adapter (Grok Build, Claude Code, …), once after the run completes |
| `SessionIdEvent` | `` `${string}.session-id` `` | `{ sessionId: string }` | a harness adapter, once when its in-sandbox session is created or resumed |
| `CodeModeExecutionStartedEvent` | `code_mode:execution_started` | `{ timestamp: number; codeLength: number }` | [Code Mode](../code-mode/code-mode), when sandbox execution begins |
| `CodeModeConsoleEvent` | `code_mode:console` | `{ level: 'log' \| 'warn' \| 'error' \| 'info'; message: string; timestamp: number }` | Code Mode, per `console.*` call inside the sandbox |
| `CodeModeExternalCallEvent` | `code_mode:external_call` | `{ function: string; args: unknown; timestamp: number }` | Code Mode, before a bound `external_*` function runs |
| `CodeModeExternalResultEvent` | `code_mode:external_result` | `{ function: string; result: unknown; duration: number }` | Code Mode, after a successful `external_*` call |
| `CodeModeExternalErrorEvent` | `code_mode:external_error` | `{ function: string; error: string; duration: number }` | Code Mode, when an `external_*` call throws |
| `CodeModeSkillCallEvent` | `code_mode:skill_call` | `{ skill: string; input: unknown; timestamp: number }` | [Code Mode with Skills](../code-mode/code-mode-with-skills), before a skill runs |
| `CodeModeSkillResultEvent` | `code_mode:skill_result` | `{ skill: string; result: unknown; duration: number; timestamp: number }` | Code Mode with Skills, after a successful skill run |
| `CodeModeSkillErrorEvent` | `code_mode:skill_error` | `{ skill: string; error: string; duration: number; timestamp: number }` | Code Mode with Skills, when a skill throws |
| `SkillRegisteredEvent` | `skill:registered` | `{ id: string; name: string; description: string; timestamp: number }` | when a skill is registered into the tool registry |
| `StructuredOutputStartEvent` | `structured-output.start` | `{ messageId: string }` | [`chat({ outputSchema, stream: true })`](../structured-outputs/streaming), once per structured message |
| `StructuredOutputCompleteEvent<T>` | `structured-output.complete` | `{ object: T; raw: string; reasoning?: string }` | structured-output streaming, once with the validated object |
| `ApprovalRequestedEvent` | `approval-requested` | `{ toolCallId: string; toolName: string; input: unknown; approval: { id: string; needsApproval: true } }` | a server tool needs approval — the run pauses; see [Tool Approval Flow](../tools/tool-approval) |
| `ToolInputAvailableEvent` | `tool-input-available` | `{ toolCallId: string; toolName: string; input: unknown }` | a client tool is invoked — the run pauses; see [Client Tools](../tools/client-tools) |
| `UIResourceEvent` | `ui-resource` | `{ resource; serverId?: string; toolCallId: string; toolName: string; meta?: Record<string, unknown> }` | an MCP tool returns a `ui://` resource ([MCP Apps](../mcp/apps)) |

## Your own custom events aren't in this union

Tools can emit arbitrary, application-defined events through the
`emitCustomEvent` context API:

```ts
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";

const importRows = toolDefinition({
  name: "importRows",
  description: "Import rows into the dataset, reporting progress as it runs",
  inputSchema: z.object({ rows: z.array(z.string()) }),
}).server(async ({ rows }, context) => {
  for (let i = 0; i < rows.length; i++) {
    context?.emitCustomEvent("my-app:progress", {
      done: i + 1,
      total: rows.length,
    });
  }
  return { imported: rows.length };
});
```

These flow over the wire exactly like the built-in events — same `CUSTOM`
chunk shape, same runtime behavior. But `'my-app:progress'` isn't one of the
literal names in `KnownCustomEvent`, so it's intentionally absent from
`ChatStream`'s type. This is the same tradeoff `StructuredOutputStream`
already made: including a generic fallback member would reintroduce the
`value: any` poison for every other event on the stream.

To read your own event's `value`, don't rely on `ChatStream`'s narrowed
union for that branch — annotate the stream as the wider `StreamChunk` type
instead, where the generic `CUSTOM` member's `value: any` needs no cast:

```ts ignore
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import type { StreamChunk } from "@tanstack/ai";
import { importRows } from "./tools";

const stream: AsyncIterable<StreamChunk> = chat({
  adapter: openaiText("gpt-5.5"),
  messages: [{ role: "user", content: "Import these rows" }],
  tools: [importRows],
});

for await (const chunk of stream) {
  if (chunk.type === "CUSTOM" && chunk.name === "my-app:progress") {
    console.log(chunk.value.done, chunk.value.total); // value: any — your event, your shape
  }
}
```

The event still arrives at runtime either way — this only changes what
TypeScript will let you write. `ChatStream` is the right default for reading
TanStack AI's own events with full type safety; fall back to `StreamChunk`
for the branches that read your own.

## Related

- [Sandbox Events](../sandbox/events) — the sandbox- and harness-specific rows of this table, in context, plus `sandbox.file.diff`'s opt-in.
- [Observability](../sandbox/observability) — the server-side hook accessors (`before()`/`after()`/`diff()`) that back `sandbox.file.diff`.
- [Showing Code Mode in the UI](../code-mode/client-integration) — rendering the `code_mode:*` events live.
- [Streaming UIs](../structured-outputs/streaming) — reading `structured-output.complete` end to end.
- [Streaming](../chat/streaming) — the standard AG-UI `StreamChunk` lifecycle this union extends.
