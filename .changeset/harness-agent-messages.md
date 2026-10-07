---
'@tanstack/ai-harness': minor
'@tanstack/ai': minor
---

- A background agent run takes messages. `start()` on `session.agents.<name>`, `session.agent(name)` and plugin `ctx.agents` returns an `AgentRun` with `send(message, { mode })`. A steer (the default) joins the run's next model call. A follow-up runs the agent again after the run ends, on the run's own transcript, and its receipt names the new run. A steer from another sender runs as a follow-up for that sender.
- `session.agentRuns()` lists the agent runs, and `session.agentRun(id)` finds one. On a durable host they also read the log, so they work after a restart.
- Every background run keeps its messages in its own thread, `<threadId>:<name>:<input id of the first run>`.
- On a durable host, a run with `resume: true` that a host stop cut gets the messages it had not taken. Without `resume`, its waiting messages settle `aborted`.
- Clients send messages with the `agentMessage` input, `client.sendToAgent()`, or `send()` on an agent item of `createSessionView`. Only runs of agents in `expose.agents` take them.
- `@tanstack/ai`: agent code can start agents with `ctx.agents.start()` when a host binds it (`SubagentBinding.agents`). Without a host, it throws. A harness counts each child against the subagent tree budget, records its parent run, and cancels children before their parent.
