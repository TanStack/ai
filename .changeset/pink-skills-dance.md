---
'@tanstack/ai-claude-code': minor
---

Expose Claude Code setting sources and loaded skills in session metadata.

`settingSources` defaults to `['project']`. Workspace projections (instructions, skills, MCP config) now load, and a local-process run no longer picks up the host's `~/.claude`. Pass `['user', 'project', 'local']` for CLI-equivalent behavior. Plugin projection installs at project scope.
