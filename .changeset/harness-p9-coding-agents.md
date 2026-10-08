---
'@tanstack/ai-sandbox': minor
'@tanstack/ai-harness': minor
'@tanstack/ai-harness-cli': minor
'@tanstack/ai-acp': minor
'@tanstack/ai-dashboard': minor
---

`@tanstack/ai-sandbox/harness` adds `codingAgents({ sandbox, agents, workspace? })`: a harness plugin that gives the lead model one tool per coding agent (Claude Code, Codex, Grok Build, or any ACP agent). Each agent runs in the sandbox, keeps its own session per thread (also after a restart), and starts read-only in the harness `plan` mode. `workspace: 'shared'` (default) runs one agent at a time in one sandbox per thread. `'per-agent'` gives each agent its own sandbox. `/fresh [agent]` starts new sessions.

`@tanstack/ai-harness` plugins can contribute `subagents`: agents the model can call as tools.

Child agent work is now visible: the CLI shows each child's tool calls and a finish line with the start of its answer, ACP editors get the child's tool calls, and the dashboard shows a block per child.
