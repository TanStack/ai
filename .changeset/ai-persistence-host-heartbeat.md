---
'@tanstack/ai-persistence': minor
---

`LogStore` gets `heartbeat({ hostId, ttlMs })`. A pin (`setAffinity`) now counts only while its host is alive: `acquire` and `listOrphaned` ignore the affinity of a host with no live heartbeat, so the logs of a host that stopped go to other hosts. A host that is alive keeps its pins, also on the logs that it released. A custom store must add `heartbeat` and this rule. `memoryLogStore()` and the conformance suite have both.
