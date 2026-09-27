---
'@tanstack/ai-harness': minor
---

Out-of-band tool invocation: a new `{ op: 'tool', name, args?, meta? }` session input runs one registered tool with no model turn. This is the provisional harness surface the agent-dashboard "injection" work builds on (schedules, run-now, webhooks), following the `@tanstack/ai-harness/ag-ui` precedent of shipping dashboard-facing seams here.

- `session.tool(name, args?, meta?)` (and the `{ op: 'tool' }` client input via `applyInput`) resolves the tool from the harness + session-plugin tools, validates `args` against its input schema, and invokes its server executor directly — modeled on the existing `command` op. The tool's lifecycle is published into the session feed as a normal AG-UI run (`RUN_STARTED`, `TOOL_CALL_START`/`ARGS`/`END`, `TOOL_CALL_RESULT`, `RUN_FINISHED`), so watchers render and persist it exactly like a tool call the model made. `meta` (e.g. an injection trigger) is echoed onto the run as a `tanstack.injection` `CUSTOM` event. Injected tools are fire-and-forget (no approval interrupt, like commands).
- Tool **visibility**: a new `toolVisibility?: Record<string, 'public' | 'private'>` on `defineHarness`. Tools default to `private` — only tools named `public` may be invoked out-of-band; unknown or private tools are rejected (`unknown_tool` / `not_public`). Visibility is reported per tool in the capabilities document (`capabilitiesOf().tools.items[].visibility`).

Additive and backward compatible: existing ops, tools, and streams are unchanged.

Generated with Claude Code.
