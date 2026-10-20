---
'@tanstack/ai-harness': minor
---

Add `createSessionView()` in `@tanstack/ai-harness/view`. It turns a session (local, or remote through `createHarnessClient()`) into one live TanStack Store state that works with any UI library.

- The state: messages with their parts, tool calls, approvals, client tools, other interrupts, questions, sign-ins, `waits` (every open wait, with its kind), child agents with their results and a `status` of `running` or `waiting`, media with signed URLs, waiting inputs, usage, models, settings, commands, and plugin state.
- The waits of background agent runs show in `approvals`, `clientTools`, and `interrupts`. The view answers each one at once: with `resolve`, or with `answer` for a `human` wait that no turn holds.
- Actions: `send` (a prompt, a steer, or a `/command`), `followUp`, `continueWithoutMessage`, `putMedia`, `cancel`, `cancelInput`, `changeInputDelivery`, `updateThreadSettings`, `reset`, `revert`, `loadAgent`, and the answers to approvals (with edited arguments), client tools, interrupts, and questions. `cancelInput`, `revert`, `approve({ id, ...options })`, `reject({ id, payload? })`, `notice({ text })`, and `putMedia` take one object, and so does the `reject({ payload? })` of an approval item.
- Typed events: `view.on('approval' | 'interrupt' | 'turnEnd' | ..., handler)` and plugin events.
- In a harness with `routing`, an assistant message has `agent`, the root agent that wrote it. After a handoff, the next agent writes a new message in the same turn.
- `view.send(text, { as: 'operator' })` sends the reply of an operator while a handoff to a person is open. The reply shows in each open view at once.
- A view that opens while a turn runs shows the turn from its start. After a reload, each child agent shows its card, and `view.loadAgent({ id })` fills it with its own messages.
- When the stream sends a `harness.gap` event, the view stops its read, loads the snapshot and the transcript again, then reads on from the new cursor. No turn shows twice.
