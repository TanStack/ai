---
'@tanstack/ai': minor
'@tanstack/ai-harness': minor
---

A background agent can continue on the host that takes over after a crash.

- `agents.start(agent, input, { resume: true })` needs a durable host (`stores.log`). Without one, it throws at start. Without `resume`, an agent that a stopped host left running still fails, as before.
- The next host runs the agent again with the same input. Its model calls continue from the saved transcript, and its finished tool calls do not run again.
- `ctx.step.do(name, fn)` in agent code keeps the result of `fn` in the log, so a side effect does not run again when the agent runs again.
- `durability.maxAttempts` caps the runs. After the cap, the run settles `failed` with the code `attempts_exhausted`.
- In `@tanstack/ai`, the agent run context has `step`, and `SubagentBinding` takes an optional `step`. Without a binding, `step.do` runs `fn` each time.
