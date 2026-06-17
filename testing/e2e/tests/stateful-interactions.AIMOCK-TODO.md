# aimock TODO — Gemini Interactions **SDK 2.x** event format

**Status:** `tests/stateful-interactions.spec.ts` is marked `test.fixme` and will
not run until [`@copilotkit/aimock`](https://github.com/CopilotKit/aimock) emits
the **SDK 2.x** Gemini Interactions event format.

This is **not** a bug in the adapter. The `gemini-upgrade` branch
(`feat(ai-gemini): upgrade @google/genai to v2 and migrate Interactions API`)
migrated `geminiTextInteractions` to the **SDK 2.x** Interactions event protocol
(the "Interactions breaking changes, May 2026"). The adapter is correct for the
live API. aimock has **not** migrated — every published version through **1.31.0**
(latest as of 2026-06-17) still emits the **SDK 1.x** event shapes — so the mock
and the adapter now disagree on the wire format, and the adapter consumes none of
the mock's text/tool deltas (empty assistant message → test fails).

Unit coverage for the 2.x adapter is comprehensive and green
(`packages/ai-gemini/tests/text-interactions-adapter.test.ts`, 25 tests) — those
feed hand-written 2.x `step.*` events. The fixme'd e2e test is the _only_ gap, and
it is purely a mock-vs-adapter format mismatch.

---

## Root cause: zero event-type overlap

| Concern              | aimock emits today (**SDK 1.x**) | adapter expects (**SDK 2.x**) |
| -------------------- | -------------------------------- | ----------------------------- |
| interaction opened   | `interaction.start`              | `interaction.created`         |
| content block opened | `content.start`                  | `step.start`                  |
| streamed delta       | `content.delta`                  | `step.delta`                  |
| content block closed | `content.stop`                   | `step.stop`                   |
| interaction finished | `interaction.complete`           | `interaction.completed`       |

Because **no `event_type` matches**, the adapter's `switch` (in
`translateInteractionEvents`, `packages/ai-gemini/src/experimental/text-interactions/adapter.ts`)
hits its observability `default` for every event, emits nothing, and the
assistant message comes back empty.

The adapter handles exactly these top-level `event_type`s:
`interaction.created`, `step.start`, `step.delta`, `step.stop`,
`interaction.status_update`, `interaction.completed`, `error`.

---

## What aimock needs to change

Source: `dist/gemini-interactions.js` (and its `src` equivalent) in the aimock
repo. Two builders need rewriting:
`buildInteractionsTextSSEEvents` and `buildInteractionsToolCallSSEEvents`.

### 1. Lifecycle events (both builders)

Rename and reshape the envelope. The `interaction` object keeps `id`, `status`,
and `usage` — only the `event_type` names change.

```diff
- { event_type: "interaction.start",    interaction: { id, status: "in_progress" } }
+ { event_type: "interaction.created",  interaction: { id, status: "in_progress" } }

- { event_type: "interaction.complete", interaction: { id, status, usage } }
+ { event_type: "interaction.completed", interaction: { id, status, usage } }
```

> The adapter reads `interaction.id` from **both** `interaction.created` and
> `interaction.completed` and surfaces it as the `gemini.interactionId` CUSTOM
> event. The e2e test reads that via the `gemini-interaction-id` element, so the
> `id` field must remain populated on these events.

Status values map unchanged: text → `completed`; tool calls → `requires_action`.
`statusToFinishReason` / `statusIsError` interpret them the same way.

### 2. Text streaming — `buildInteractionsTextSSEEvents`

The **inner delta shape is identical** (`{ type: "text", text }`). Only the
envelope `event_type` changes, plus an optional `step.start`/`step.stop` wrapper.

```diff
- { event_type: "content.start", index: 0, content: { type: "text" } }
+ { event_type: "step.start", index: 0, step: { type: "model_output" } }

- { event_type: "content.delta", index: 0, delta: { type: "text", text: slice } }
+ { event_type: "step.delta", index: 0, delta: { type: "text", text: slice } }

- { event_type: "content.stop", index: 0 }
+ { event_type: "step.stop", index: 0 }
```

Minimum viable fix for _this_ test: the adapter lazily opens the assistant
message on the first `step.delta { type: "text" }`, so renaming
`content.delta` → `step.delta` alone is enough to make text render. Emitting the
`step.start { type: "model_output" }` / `step.stop` wrapper is the
spec-faithful shape and is recommended.

### 3. Tool calls — `buildInteractionsToolCallSSEEvents`

This is the larger change. In 2.x the call **identity (`id`, `name`,
`arguments`) lives on `step.start`**, not in a delta, and streamed argument
fragments use a dedicated `arguments_delta` variant carrying a **string**
fragment (not a parsed object).

```diff
  // per tool call, at step index `idx`:
- { event_type: "content.start", index: idx, content: { type: "function_call" } }
- { event_type: "content.delta", index: idx,
-   delta: { type: "function_call", id, name, arguments: argsObj } }
- { event_type: "content.stop",  index: idx }
+ { event_type: "step.start", index: idx,
+   step: { type: "function_call", id, name, arguments: {} } }
+ // optional: stream args as JSON-string fragments
+ { event_type: "step.delta", index: idx,
+   delta: { type: "arguments_delta", arguments: "<json-string fragment>" } }
+ { event_type: "step.stop",  index: idx }
```

Adapter contract for tool calls:

- `step.start.step.id` is the tool-call id; the adapter maps `index → id` so
  later `arguments_delta` / `step.stop` at the same `index` resolve correctly.
- `step.start.step.arguments` may be `{}` (placeholder) when streaming; the real
  args then arrive as `arguments_delta` string fragments. It may also be a fully
  populated object for non-streamed calls — both are accepted.
- `arguments_delta.arguments` is a **string** fragment; the concatenation across
  all fragments for a given index must be valid JSON by `step.stop`.

### 4. Reasoning (`thought`) — not exercised by the current spec

For completeness, 2.x reasoning is:
`step.start { step: { type: "thought", summary?: [{ type: "text", text }] } }`
then `step.delta { delta: { type: "thought_summary", content: { text } } }`.

---

## How to verify once aimock ships 2.x

1. Bump `@copilotkit/aimock` in `testing/e2e/package.json`, `pnpm install`.
2. Confirm the new emitter produces `step.*` events:
   ```bash
   grep -E 'event_type: "(step|interaction\.created|interaction\.completed)' \
     node_modules/.pnpm/@copilotkit+aimock@*/node_modules/@copilotkit/aimock/dist/gemini-interactions.js
   ```
3. Un-`fixme` the test (`test.fixme` → `test`) in
   `tests/stateful-interactions.spec.ts`.
4. ```bash
   pnpm --filter @tanstack/ai-e2e test:e2e -- --grep "stateful"
   ```

## References

- Adapter event translator: `packages/ai-gemini/src/experimental/text-interactions/adapter.ts`
  (`translateInteractionEvents`, the `switch (event.event_type)`).
- 2.x unit fixtures (canonical event shapes): `packages/ai-gemini/tests/text-interactions-adapter.test.ts`.
- aimock current emitter: `@copilotkit/aimock/dist/gemini-interactions.js`
  (`buildInteractionsTextSSEEvents`, `buildInteractionsToolCallSSEEvents`).
- aimock repo: https://github.com/CopilotKit/aimock
