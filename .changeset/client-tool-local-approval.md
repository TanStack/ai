---
'@tanstack/ai-client': patch
---

Ask for approval of a `needsApproval` client tool when the server does not ask for it, for example a custom AG-UI server or a connection adapter with no TanStack server. Before, the client logged a warning and the tool never ran. Now the call comes in `interrupts` as a `tool-approval` item, the same as with `chat()`. On approve, the client runs the tool and continues the loop. On deny, it sends a denied result and continues.
