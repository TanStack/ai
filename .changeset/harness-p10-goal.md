---
'@tanstack/ai-harness': minor
---

Add the `goal({ judge })` plugin to `@tanstack/ai-harness/plugins`. `/goal <text>` sets a goal and starts a turn. After each turn, the `judge` model reads the goal and the end of the transcript and decides if the goal is met. If it is not met, the plugin starts the next turn, up to `maxRounds` turns (20 by default). The loop also stops when a turn waits for approval or fails, and when the user sends a message. `/goal` shows the status, `/goal stop` ends the goal, and `/goal resume` continues it. The goal is plugin state, so it survives a restart. The `GoalMet` event tells other plugins and clients that the goal is met.

A plugin's `ctx.session.prompt(text)` now returns the turn, so the plugin can cancel it before it starts. The turn always waits in the queue, also on a harness with `busy: 'reject'`.
