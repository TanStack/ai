---
'@tanstack/ai-sandbox': minor
---

Add `@tanstack/ai-sandbox/harness` for `@tanstack/ai-harness`:

- `codingAgents({ sandbox, agents, workspace? })` is a harness plugin. The lead model gets one tool per coding agent (Claude Code, Codex, Grok Build, or any ACP agent). Each agent works in the sandbox, keeps its own session per thread (also after a restart), and starts read-only in the `plan` mode of `permissions()`. `/fresh [agent]` starts a new session. `workspace: 'shared'` (default) runs the agents of a thread one at a time in one sandbox. `'per-agent'` gives each agent its own sandbox.
- `codingAgents` runs agents only on the host that owns the log of the thread, so `'shared'` runs one agent at a time also with many hosts.
- `sandboxWorkspaceBackend(sandbox, { owned? })` runs the coding tools of `@tanstack/ai-harness/plugins/coding` (`workspaceTools()`, `snapshots()`, `formatter()`) in a sandbox. It resolves links in the sandbox, reads one page of a file in the sandbox, and stops background jobs by their id (the pid and its start time), also from another host. It never stops another process that got the pid of a job. `binding()` gives the provider and the sandbox id, so another host can resume the sandbox. `close()` stops the jobs of the backend. A session close closes it with `'moved'`, so an owned sandbox stays for the next host. `host.sessions.delete` closes it with `'closed'`, and with `owned: true` that destroys the sandbox.

`@tanstack/ai-harness` is an optional peer dependency.
