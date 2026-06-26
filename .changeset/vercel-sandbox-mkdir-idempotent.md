---
'@tanstack/ai-sandbox-vercel': patch
---

Fix `create()` failing with HTTP 400 `"cannot create directory '/vercel/sandbox': File exists"` when the workspace directory already exists. The Vercel SDK's native `mkDir` is not idempotent and the default workdir ships in the runtime image, so a fresh sandbox already has it. An "already exists" failure is now treated as success while other filesystem errors still surface.
