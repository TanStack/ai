---
'@tanstack/ai-sandbox': patch
---

Leave the Git source token out of the workspace hash. A new token for `gitSource({ auth: { token } })` (for example, an hourly GitHub App token) no longer changes the sandbox key, so `reuse: 'thread'` finds the same sandbox again. The URL, ref, depth, and username still change the key.
