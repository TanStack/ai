---
'@tanstack/ai-harness': minor
---

Add `createSessionView()` in `@tanstack/ai-harness/view`. It turns a session (local, or remote through `createHarnessClient()`) into one live TanStack Store state that works with any UI library.

- The state: messages with their parts, tool calls, approvals, client tools, other interrupts, questions, sign-ins, child agents with their results, media with signed URLs, waiting inputs, usage, models, settings, commands, and plugin state.
- Actions: `send` (a prompt, a steer, or a `/command`), `followUp`, `continue`, `upload`, `cancel`, `cancelInput`, `setDelivery`, `configure`, `reset`, `revert`, and the answers to approvals (with edited arguments), client tools, interrupts, and questions.
- Typed events: `view.on('approval' | 'interrupt' | 'turnEnd' | ..., handler)` and plugin events.
- A view that opens while a turn runs shows the turn from its start. After a reload, each child agent shows its own messages again.
