---
'@tanstack/ai-computer-use': patch
---

An aborted computer action no longer runs when it waits in the queue. A `wait`, `hold_key`, a repeated key press, a `navigate`, or the next action of a batch now stops when the call aborts. Held keys are still released. A drag does not start after an abort. A drag that started goes to its end point, because a release in the middle drops the item at the wrong point.
