---
'@tanstack/ai-harness': minor
---

Add `createSessionView(session | client)` at `@tanstack/ai-harness/view`. It keeps a live TanStack Store of everything a UI shows: messages with streaming text, tool calls, and child agents, plus approvals, questions, sign-ins, status, background agents, commands, settings, tools, and plugin state. It has actions (`send`, `command`, `setConfig`, `cancel`, `approve`, `reject`) and typed events (`view.on('approval', ...)`, `view.on(GoalMet, ...)`). It works with any UI library through the TanStack Store adapters or `store.subscribe`, and it works in the browser with `createHarnessClient`.

New reads for it: `session.transcript()`, `session.describe()`, `snapshot().plugins`, and on the client `transcript()`, `describe()`, `answer()`, `command()`, `setConfig()`, and `events({ onConnection })`. `createHarnessHandler` serves `GET .../transcript` and `GET .../describe`. `selectGoal(state)` reads the goal from a view.
