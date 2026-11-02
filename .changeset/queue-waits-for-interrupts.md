---
'@tanstack/ai-client': patch
---

Keep queued messages in the queue while a run is paused on an interrupt, for example a tool approval. Before, the queue sent the next message as soon as the paused run ended, so a new run started while the tool call was still unanswered. Now the queue sends after the run that answers the interrupt ends with success.
