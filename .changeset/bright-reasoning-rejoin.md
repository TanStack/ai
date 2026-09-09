---
'@tanstack/ai-client': patch
---

Keep reasoning and tool activity when resuming a run whose first content is reasoning or a reasoning signature. Drop the hydrated partial before replay creates a new assistant message, so a follow-up retains the completed activity.
