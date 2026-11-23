---
'@tanstack/ai-harness': patch
---

A snapshot on a host that does not run the turn now matches the snapshot of the host that runs it. The status is `running` while the log has a running turn. While a `resolve` runs, the interrupts that it answered are not in `pendingWaits`. Before, `host.observe(...).snapshot()` and a session open on another host returned `idle` while a turn ran, and `requires_action` with the answered approval while a resumed turn ran. Behind a load balancer, a client that read its snapshot from another host showed the approval again after the user answered it.
