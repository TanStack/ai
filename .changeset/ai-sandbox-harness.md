---
'@tanstack/ai-sandbox': minor
---

Add `@tanstack/ai-sandbox/harness` for `@tanstack/ai-harness`:

- `codingAgents({ sandbox, agents, workspace? })` is a harness plugin. The lead model gets one tool per coding agent (Claude Code, Codex, Grok Build, or any ACP agent). Each agent works in the sandbox, keeps its own session per thread (also after a restart), and starts read-only in the `plan` mode of `permissions()`. `/fresh [agent]` starts a new session. `workspace: 'shared'` (default) runs the agents of a thread one at a time in one sandbox. `'per-agent'` gives each agent its own sandbox.
- `sandboxWorkspaceBackend(sandbox)` runs the coding tools of `@tanstack/ai-harness/plugins/coding` (`workspaceTools()`, `snapshots()`, `formatter()`) in a sandbox.

`@tanstack/ai-harness` is an optional peer dependency.
