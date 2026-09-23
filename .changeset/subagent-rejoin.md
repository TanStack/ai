---
'@tanstack/ai-client': patch
---

A refresh during a subagent run drops the saved card when `SUBAGENT_STARTED` arrives, then builds that card again from the stream. The replayed text stays in the card.
