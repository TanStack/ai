---
title: Context Optimization
id: context-optimization
order: 6
description: "Shrink large tool results before they reach the model, without losing anything. optimize() and tool optimizations from @tanstack/ai-optimize truncate only the fields you mark, only in the model projection."
keywords:
  - tanstack ai
  - context optimization
  - tool results
  - truncation
  - middleware
  - mcp
  - token cost
---

A tool that returns a 40 KB log, a full web page, or a long file listing spends that whole payload on the model, every turn, for the rest of the run. Most of it is never read. The same is true of what a tool was *called with*: the full file body handed to `write_file` sits in history long after the file is on disk. But the harness cannot know which lines matter, so blind, size-based truncation risks cutting the one line that did.

`@tanstack/ai-optimize` puts the decision where the meaning lives. Nothing is trimmed unless it is **optimized**, either by the tool author at field level, or by you with `optimize()` for tools you did not write (MCP above all). It trims two things: the **results** a tool returns, and the **arguments** of a call that has already completed. An unoptimized tool arrives whole.

Trimming only ever touches the **projection**: the copy of the conversation sent to the model. Execution, the saved transcript, the event stream, and the UI always keep the full value. The model can pull the original back with a `retrieve_context` tool call. That is the one idea to hold onto, everything below changes what the model *sees*, never what actually happened.

## Install

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai-optimize
vue: @tanstack/ai-optimize
solid: @tanstack/ai-optimize
svelte: @tanstack/ai-optimize
preact: @tanstack/ai-optimize
angular: @tanstack/ai-optimize
octane: @tanstack/ai-optimize
vanilla: @tanstack/ai-optimize

<!-- ::end:tabs -->

## Add it last

Reach for this once your agent already works. The order that holds up:

1. **Build with no optimization.** Get the behavior you want first, correct tool use, correct answers, full-fidelity context.
2. **Lock that behavior in with evals.** A handful of tasks whose outcomes you trust, run unoptimized. This is your reference for what "working" means.
3. **Then add `optimize()` and re-run the same evals.** Keep a rule only if the evals still pass *and* the token count drops. If accuracy slips, or a field gets pulled back with `retrieve_context` on most turns, that rule cost more than it saved, so back it off.

Optimization is a cost pass over behavior you have already proven, not something you design in from the start. Truncating a field the agent needed is a regression, and your evals are what catch it before your users do. This is also why nothing here is on by default: an unoptimized tool arrives whole.

## Optimize a tool you own

Mark the field that gets large with a `context` policy on the tool definition. Here, a file reader keeps the `path` whole and truncates only `content` when it runs long:

You build every projection with a combinator. The type is branded, so a bare object literal does not type-check, there is one way to write it and no shape to get wrong.

```ts
import { toolDefinition } from '@tanstack/ai'
import { truncateHeadTail, aboveTokens } from '@tanstack/ai-optimize'
import { z } from 'zod'

const readFile = toolDefinition({
  name: 'read_file',
  description: 'Read a file from disk',
  inputSchema: z.object({ path: z.string() }),
  outputSchema: z.object({ path: z.string(), content: z.string() }),
  context: {
    result: {
      fields: {
        // Over ~1500 tokens, keep a ~750-token head+tail preview.
        content: aboveTokens(1500, truncateHeadTail({ maxTokens: 750 })),
      },
    },
  },
})
```

Then wire the middleware and the retrieval tool with `createContextRuntime()`:

```ts ignore
import { chat } from '@tanstack/ai'
import { createContextRuntime } from '@tanstack/ai-optimize'

const runtime = createContextRuntime()

chat({
  adapter,
  messages,
  tools: [readFile.server(readFromDisk), runtime.retrieveTool],
  middleware: [runtime.middleware],
})
```

The combinators are all deterministic. No model call, no summarization:

| Combinator                  | Keeps                                                   |
| --------------------------- | ------------------------------------------------------- |
| `truncateHead({ maxTokens })`     | The first `maxTokens` of the field.               |
| `truncateTail({ maxTokens })`     | The last `maxTokens` of the field.                |
| `truncateHeadTail({ maxTokens })` | 60% from the front, 40% from the end, middle elided. |
| `dropWithRef()`             | Nothing. A one-line marker with a retrieval ref.        |
| `aboveTokens(n, strategy)`  | Wraps any of the above; applies it only over `n` tokens. |

Pass `{ retrievable: false }` to any strategy to drop the retrieval ref. Summarization is a separate concern and belongs to [Compaction](./compaction). This feature never calls a model.

## Wrap tools you do not own (MCP)

You cannot add a `context` field to a tool that an MCP server defines. `optimize()` attaches policy from the outside. It wraps copies of the tools, never your originals, and appends `retrieve_context` when any rule is retrievable.

```ts
import { optimize, truncateHeadTail, dropWithRef, aboveTokens } from '@tanstack/ai-optimize'

declare const mcpTools: Parameters<typeof optimize>[0]

const opt = optimize(mcpTools, {
  // Applies to every tool's result fields.
  defaults: {
    projection: aboveTokens(1500, truncateHeadTail({ maxTokens: 750 })),
    mode: 'leaves',
  },
  // Per-tool rules. These win over defaults; a field the author optimized wins over these.
  tools: {
    fetch_page: {
      result: { fields: { body: truncateHeadTail({ maxTokens: 1000 }) } },
    },
    write_file: {
      // Argument projection is optimize()-only, and only for completed calls.
      args: { fields: { content: dropWithRef() } },
    },
  },
  // Never touch this tool's results.
  exclude: ['get_account_balance'],
  onEvent: (e) => console.log(e),
})
```

Then pass `opt.tools` and `opt.middleware` to `chat()`:

```ts ignore
chat({ adapter, messages, tools: opt.tools, middleware: [opt.middleware] })
```

`defaults.mode` picks how un-ruled content shrinks:

- `leaves` (default): each oversized string leaf in the result is truncated on its own. Short leaves like IDs and statuses fall under the threshold and pass through whole.
- `flatten`: the whole result is serialized and truncated as one string.

### Trim the arguments of a completed call

Trimming is not only for results. The **arguments** a tool was called with sit in history too, and some are large: the full file body passed to `write_file`, the whole program passed to a code interpreter. Once the call has run, the model rarely needs those arguments again, the result is what matters.

`optimize()` can drop them. `dropWithRef()` on an argument field replaces it in history with a one-line marker:

```ts ignore
write_file: {
  // The file is on disk now; the content argument no longer earns its place in history.
  args: { fields: { content: dropWithRef() } },
},
```

This changes the **completed call** only. The approval prompt, the live stream, and execution all saw the full argument; this trims the model-facing copy of a call that already finished. Two rules keep it safe:

- It is `optimize()`-only. A tool author cannot declare argument trimming, it is a consumer decision about history.
- It never applies to `needsApproval` tools. Their arguments are the exact thing a human approved, so they stay whole.

`dropWithRef()` still honors the size gate: it uses the default 1500-token threshold (wrap it in `aboveTokens(n, ...)` to change that), so a small argument stays whole. A large one stays whole too if the marker would not be shorter than it.

Two cases to watch:

- **Drop only when nothing later in the run reads it.** A terminal write (the last thing the agent does with that file) is free to drop. Dropping writes an agent keeps working against mid-session can cost more than it saves, because the model re-checks work it can no longer see in its own history.
- **A failed call still counts as completed.** If a large write fails, its arguments can still be dropped even though the file was never saved, and the model must retrieve them before it can retry. Don't drop arguments for a tool whose failures you can't distinguish.

## Code mode

[Code mode](../code-mode/code-mode) already keeps most data out of the model context: the agent writes one `execute_typescript` program that reads files, transforms them, and writes them back, all inside the sandbox. The model never sees the file contents. But two things still ride in history and grow fast:

- The **program source** (`typescriptCode`). It ran once; after that the model needs the *result*, not the code it already submitted. This is the `write_file` story again.
- The **logs**. Agents `console.log` to debug ("let me print what I'm working with"), and one program can dump whole files into `logs`. Pure noise once the step is done.

Optimize `execute_typescript` the same way you optimize any tool: drop the completed program, clip the logs, keep the returned result whole.

```ts ignore
import { chat } from '@tanstack/ai'
import { createCodeMode } from '@tanstack/ai-code-mode'
import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'
import { optimize, truncateHeadTail, dropWithRef, aboveTokens } from '@tanstack/ai-optimize'

const { tools, systemPrompt } = createCodeMode({
  driver: createQuickJSIsolateDriver(),
  // Code mode runs the tools, so pass server-backed tools, not bare definitions.
  tools: [readFile.server(readFromDisk), writeFile.server(writeToDisk)],
})

const opt = optimize(tools, {
  tools: {
    execute_typescript: {
      // The program already ran; drop its source from the completed call.
      args: { fields: { typescriptCode: dropWithRef() } },
      // Debug logs are disposable; the returned result stays whole.
      result: { fields: { logs: aboveTokens(1500, truncateHeadTail({ maxTokens: 750 })) } },
    },
  },
})

chat({
  systemPrompts: [systemPrompt],
  adapter,
  messages,
  tools: opt.tools,
  middleware: [opt.middleware],
})
```

For a logging-heavy agent this is the difference between carrying every file dump for the rest of the run and carrying a 750-token preview. The result the model actually reasons over is untouched, so the answer does not change.

### Snippet writing

If you use [code-mode snippets](../code-mode/code-mode-with-snippets), the agent calls `register_snippet` with the full `code` of a snippet to save. Once registered, that code lives in the snippet store and the agent calls the snippet by name, it never needs the original `register_snippet` arguments again. That makes it a safe, terminal argument to drop:

```ts ignore
register_snippet: {
  // The code is in the snippet store now; drop it from the call in history.
  args: { fields: { code: dropWithRef() } },
},
```

`register_snippet` is a textbook fit for argument dropping: the write is terminal (the agent moves on to calling the snippet, not re-reading how it registered it), and the store is the source of truth, exactly the `write_file`-to-disk shape.

## Errors are exempt

A failed tool result (`state === 'error'`) is never truncated. A model needs the whole error to recover. Opt a specific tool in only when you mean it:

```ts ignore
context: {
  result: {
    includeErrors: true,
    fields: { content: truncateTail() },
  },
}
```

## Retrieving the original

Every truncation leaves a marker the model can act on:

```
[Truncated for context: content, ~2000 tokens, kept ~750. Full content: retrieve_context(ref="ctx_call_17_result_content")]

<first 1800 chars>

[... 5000 chars elided ...]

<last 1200 chars>
```

The model calls `retrieve_context(ref="ctx_call_17_result_content")` and gets the full original field back. That result is itself exempt from projection, so it never gets re-truncated.

Retrieval is also a tuning signal. If a field is retrieved on most turns, it was the wrong field to truncate. Watch for it through `onEvent` or the `tanstack.optimize` log record, which carries one entry per projection and per retrieval.

The stash that backs retrieval is scoped to a single run. Within the run that truncated a field, retrieval is guaranteed. The canonical saved messages still hold every original, so projected history rebuilds identically on the next run.

## When it helps, and when it hurts

Trimming is not a free win. Whether it saves tokens or costs them depends on one thing: **is the field disposable, or load-bearing?** A build log the agent reads once is disposable. A file the agent is still editing is load-bearing. Truncate the first and you save almost all of it for free. Truncate the second and the model calls `retrieve_context` to pull it back, or works around the gap, and you spend *more* than you saved.

In our evals, clipping disposable shell logs cut input ~96%. On a load-bearing multi-file edit the picture flipped: truncating the file reads forced the agent to retrieve them back (input up ~50 to ~70%), and the config that kept the reads whole but dropped completed `write_file` arguments mid-session fared worst of all (~99% more input, because the agent re-checked work it could no longer see). Pick by the field, not by size.

| Field | Nature | What to do | Risk |
| --- | --- | --- | --- |
| Shell / command `stdout`, build & test logs | Disposable, answer usually in the tail | `result` `truncateHeadTail()`, keep the tail | Low |
| Code-mode `logs` (debug prints) | Disposable | `result` `truncateHeadTail()` | Low |
| `write_file.content`, the **last** write of that file | Redundant once on disk | `args` `dropWithRef()` | Low |
| `register_snippet.code` | Lives in the snippet store | `args` `dropWithRef()` | Low |
| A web page or fetch body read once | Usually disposable | `result` `truncateHeadTail()` | Medium, the needle may be mid-page |
| `write_file.content` **mid-session**, more edits follow | The agent re-checks its own writes | Leave whole, or drop only the final write | High, dropping it backfires |
| `read_file.content` while editing | Load-bearing | Keep whole (pin a high `aboveTokens`) | Truncating forces retrievals |
| Short id / status / count fields | Load-bearing and already small | Nothing, `leaves` mode passes them through | Low |

Three rules of thumb:

- **Trim logs, keep data.** If later steps compute over the whole field, keep it. If the agent reads it once and the answer is in the head or tail, clip it.
- **Drop an argument only when it is terminal.** A completed write is safe to drop only if nothing downstream reads it again.
- **Watch retrievals.** If a field is retrieved on most turns, you trimmed the wrong one. That is the signal to back it off.

## Order with compaction

If you use both middlewares, put `optimize` before `withCompaction`. Optimize shrinks each tool result first, then compaction sees the smaller set and decides what to drop or summarize.

```ts ignore
chat({
  adapter,
  messages,
  tools: opt.tools,
  middleware: [opt.middleware, withCompaction({ maxTokens: 100_000 })],
})
```

## Token counts are estimates

To stay dependency-free, token sizes use a character heuristic: text is about `chars / 4`, JSON about `chars / 2`. Every count in a marker, event, or record is an estimate and is written with a leading `~`. Treat them as signal, not billing.
