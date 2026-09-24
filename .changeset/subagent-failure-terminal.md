---
'@tanstack/ai': patch
---

Carry the failing subagent's own error message and code on the parent `RUN_ERROR` instead of a generic "A subagent failed", and keep the children's token usage on that terminal so a failed turn still reports what it spent. Also settle the routed-subagent persistence record when a run is stopped while the router is still deciding, which previously left the record `running` forever and made `reconstructChat` hand the client a run to tail that never emits.
