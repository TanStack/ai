---
'@tanstack/ai-acp': patch
---

When a turn ends while the editor shows a question form (for example, another client answered it), the agent now sends `$/cancel_request` for that form. Before, the turn waited for the editor and did not report idle.
