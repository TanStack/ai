---
'@tanstack/ai-sandbox-daytona': patch
---

Daytona now reports `writableStdin: false`. The session API cannot close a command's stdin, so `stdin.end()` never sent EOF and stdin-fed harnesses (Claude Code, Codex) hung forever. They now get the prompt from a file redirect instead.
