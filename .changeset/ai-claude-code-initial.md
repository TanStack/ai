---
'@tanstack/ai-claude-code': minor
---

New `@tanstack/ai-claude-code` package: a Claude Code **harness adapter that runs inside a sandbox**. It declares `requires: [SandboxCapability]` and spawns the `claude` CLI (`claude -p --output-format stream-json`) inside the sandbox provided by `withSandbox(...)`, streaming its events back as AG-UI chunks. Claude Code owns the agent loop and executes its own native tools (bash, file edits, search) against the sandbox workspace; their activity streams back as resolved tool-call events. Sessions are resumable via `modelOptions.sessionId` (surfaced through a `claude-code.session-id` custom event), and the working-tree diff is emitted as a `file.changed` custom event after each run. Requires the `claude` executable and `ANTHROPIC_API_KEY` to be available in the sandbox (e.g. via `workspace.secrets`).
