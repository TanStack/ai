---
'@tanstack/ai-harness': patch
---

A resolve after a restart now continues the turn that stopped for an interrupt. Before, the waiting interrupts lived only in memory, so the next host refused the resolve with `no_pending_interrupts`. The session now keeps them in `stores.metadata`, with the agent cards of a routed turn, and the next host that opens the thread reads them back. A resolve removes the stored copy. Without a metadata store, the interrupts stay in memory, as before.
