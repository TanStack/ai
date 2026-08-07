---
title: Custom Events Reference
id: custom-events
order: 1
description: "KnownCustomEvent taxonomy + plain-if narrowing on ChatStream (no helper, no cast)."
keywords:
  - tanstack ai
  - custom events
  - KnownCustomEvent
  - ChatStream
  - ag-ui protocol
  - CUSTOM event
  - stream narrowing
---

If you need a typed `CUSTOM` event from a `chat()` stream → check `chunk.type === 'CUSTOM'` then `chunk.name`. Feature pages document their events in context; this page is the full map.

## Type: `ChatStream`

Default return of `chat()` (no `outputSchema`, `stream` not `false`):

```ts
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";
import type { ChatStream } from "@tanstack/ai";

const stream: ChatStream = chat({
  adapter: openaiText("gpt-5.5"),
  messages: [{ role: "user", content: "Hello" }],
});
```

```ts ignore
type ChatStream = AsyncIterable<Exclude<StreamChunk, CustomEvent> | KnownCustomEvent>
```

Raw `StreamChunk` has one generic `CUSTOM` member (`name: string`, `value: any`) that poisons every narrow. `ChatStream` removes that member and adds `KnownCustomEvent` — literal `name` + concrete `value` per event.

## Narrow with a plain `if`

No `isCustomEvent` helper:

```ts ignore
import { chat } from "@tanstack/ai";
import { openaiText } from "@tanstack/ai-openai";

const stream = chat({
  adapter: openaiText("gpt-5.5"),
  messages: [{ role: "user", content: "Hello" }],
});

for await (const chunk of stream) {
  if (chunk.type === "CUSTOM" && chunk.name === "sandbox.file.diff") {
    console.log(chunk.value.path, chunk.value.diff);
  } else if (chunk.type === "CUSTOM" && chunk.name === "structured-output.complete") {
    console.log(chunk.value.object);
  }
}
```

## Full taxonomy

All extend base `CustomEvent` (`type: 'CUSTOM'`, optional `model?`). Union: `KnownCustomEvent` from `@tanstack/ai`.

| Interface | `name` | `value` | When |
| --- | --- | --- | --- |
| `SandboxFileCustomEvent` | `sandbox.file` | `{ type: 'create' \| 'change' \| 'delete'; path: string; timestamp: number }` | Per file change in a [sandbox](../sandbox/events) |
| `SandboxFileDiffEvent` | `sandbox.file.diff` | `{ path: string; diff: string }` | Opt-in `fileEvents: { diff: true }` |
| `FileChangedEvent` | `file.changed` | `{ path: string; diff: string }` | Harness adapter, once after run |
| `SessionIdEvent` | `` `${string}.session-id` `` | `{ sessionId: string }` | Harness session created/resumed |
| `CodeModeExecutionStartedEvent` | `code_mode:execution_started` | `{ timestamp: number; codeLength: number }` | [Code Mode](../code-mode/code-mode) start |
| `CodeModeConsoleEvent` | `code_mode:console` | `{ level: 'log' \| 'warn' \| 'error' \| 'info'; message: string; timestamp: number }` | Sandbox `console.*` |
| `CodeModeExternalCallEvent` | `code_mode:external_call` | `{ function: string; args: unknown; timestamp: number }` | Before `external_*` |
| `CodeModeExternalResultEvent` | `code_mode:external_result` | `{ function: string; result: unknown; duration: number }` | After successful `external_*` |
| `CodeModeExternalErrorEvent` | `code_mode:external_error` | `{ function: string; error: string; duration: number }` | `external_*` throw |
| `CodeModeSkillCallEvent` | `code_mode:skill_call` | `{ skill: string; input: unknown; timestamp: number }` | [Code Mode Skills](../code-mode/code-mode-with-skills) before run |
| `CodeModeSkillResultEvent` | `code_mode:skill_result` | `{ skill: string; result: unknown; duration: number; timestamp: number }` | Skill success |
| `CodeModeSkillErrorEvent` | `code_mode:skill_error` | `{ skill: string; error: string; duration: number; timestamp: number }` | Skill throw |
| `SkillRegisteredEvent` | `skill:registered` | `{ id: string; name: string; description: string; timestamp: number }` | Skill registered |
| `StructuredOutputStartEvent` | `structured-output.start` | `{ messageId: string }` | [`chat({ outputSchema, stream: true })`](../structured-outputs/streaming) |
| `StructuredOutputCompleteEvent<T>` | `structured-output.complete` | `{ object: T; raw: string; reasoning?: string }` | Validated object |
| `ApprovalRequestedEvent` | `approval-requested` | `{ toolCallId; toolName; input; approval: { id; needsApproval: true } }` | Server tool needs approval — [Tool Approval](../tools/tool-approval) |
| `ToolInputAvailableEvent` | `tool-input-available` | `{ toolCallId; toolName; input }` | Client tool invoked — [Client Tools](../tools/client-tools) |
| `UIResourceEvent` | `ui-resource` | `{ resource; serverId?; toolCallId; toolName; meta? }` | MCP `ui://` resource — [MCP Apps](../mcp/apps) |

## App-defined events are outside this union

Emit via `emitCustomEvent` in a tool:

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

Runtime shape matches built-ins; `'my-app:progress'` is **not** in `KnownCustomEvent` (adding a generic fallback would re-poison `value` for everyone).

To type your own branch, annotate as wider `StreamChunk`:

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
    console.log(chunk.value.done, chunk.value.total); // value: any
  }
}
```

Default to `ChatStream` for framework events; fall back to `StreamChunk` for app events.

## Related

- [Sandbox Events](../sandbox/events)
- [Observability](../sandbox/observability)
- [Showing Code Mode in the UI](../code-mode/client-integration)
- [Streaming UIs](../structured-outputs/streaming)
- [Streaming](../chat/streaming)
