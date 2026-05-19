---
'@tanstack/ai-react': patch
---

fix(ai-react): reset `partial` and `final` synchronously on user actions, not only on `RUN_STARTED`

`useChat({ outputSchema })` previously kept the prior run's `partial`/`final` visible in the window between calling `sendMessage`/`reload`/`append`/`clear` and the server's first chunk. The reset now fires immediately on the user action, so the UI clears in sync with intent. The existing `RUN_STARTED` reset is preserved for agent-loop iterations within a single run.
