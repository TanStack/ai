---
'@tanstack/ai-sandbox': patch
'@tanstack/ai-sandbox-daytona': minor
'@tanstack/ai-grok-build': patch
'@tanstack/ai-codex': patch
'@tanstack/ai-acp': patch
'@tanstack/ai-claude-code': patch
---

fix: make default Daytona + Grok/Codex sandbox runs work without extra wrappers

Headless Grok and Codex stay permissive when policy is deny-only plus default allow. Daytona remaps `/workspace`, starts stopped sandboxes on resume, keeps secrets out of create-time envVars and command strings, and uses native fs/git plus session stdin. Nested skills project by name. Durable Grok journals when durability is wired.
