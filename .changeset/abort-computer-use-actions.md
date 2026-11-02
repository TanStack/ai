---
'@tanstack/ai-computer-use': patch
---

An aborted computer action no longer runs when it waits in the queue. A `wait`, `hold_key`, or the next action of a batch now stops when the call aborts.
