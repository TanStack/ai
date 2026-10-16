---
'@tanstack/ai-harness': minor
---

Add `@tanstack/ai-harness`: build an agent harness on TanStack AI. A harness keeps one conversation open across many turns.

- `defineHarness()` names an agent: its adapter, tools, system prompts, middleware, agents, subagents, routing, plugins, turn hooks, and durability options.
- `createHarnessHost()` opens sessions. A session takes `send` (a prompt, a steer into the running turn, a follow-up, or a message to an agent run with `to`), `continue`, `reset`, `resolve`, `cancel`, and `background` inputs. Each returns an operation with a receipt, and the session streams typed events. `host.isOpen({ harness, threadId })` says whether this host holds that session open.
- `definePlugin()` adds tools, prompts, middleware, agents, commands, config options, state, and extension points to a session or to one turn.
- Agents run from code with `session.agents.<name>.run()` and `.start()`. In agent code, `harnessOf(ctx)` gives `step.do()` (a finished step returns its stored value when the run runs again) and `agents.start()` (a child that counts against the subagent budget).
- With `stores.log` from `@tanstack/ai-persistence`, a session is durable: inputs, tool results, and steps are in the log, and the next host recovers a turn that a crash stopped. `durableTool()` runs side effects once. `durability.truncatedToolResult` sets the text of a tool call cut at the output limit. Without it, a cut answer ends the turn.
- `turn.onModelError`, `retryTransientErrors()`, `turn.beforeFinish`, and `turn.canJoin` control how a turn retries, continues, and ends.
- `session.onQuestion`, `session.onAuthRequired`, `session.onMedia`, and `session.onUsage` call a listener for the events that a user answers or sees, with a typed value.
- Sessions also have thread settings, fork and revert, usage totals, media files, the transcript of each child agent (`session.agentTranscript`), and `harnessText()` / `harnessAgent()` to use a harness as a text adapter or an agent.
