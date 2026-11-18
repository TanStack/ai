---
'@tanstack/ai-sandbox-railway': patch
---

Require `railway` 3.17 or newer, which looks up the environment from a project token. With `RAILWAY_TOKEN` set to a project token, `environmentId` and `RAILWAY_ENVIRONMENT_ID` are no longer needed. An account or workspace token (`RAILWAY_API_TOKEN`) still needs one of them.
