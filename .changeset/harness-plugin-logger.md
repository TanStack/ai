---
'@tanstack/ai-mcp': patch
'@tanstack/ai-code-mode': patch
'@tanstack/ai-skills': patch
---

The `mcp()`, `codeMode()`, and `skills()` harness plugins send their warnings to the logger of the host (`createHarnessHost({ logger })`).
