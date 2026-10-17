---
'@tanstack/ai-harness': patch
---

One host owns the log of a thread at a time. The first write of a host takes the log, one timer per host renews every log that it owns, and the host gives a log back when it has no work. A host that opens a thread while another live host owns its log does not recover that work: the work runs again only after that ownership expires. A host that loses a log stops its work on it, and its sessions still read the thread. The `ownership` option of `createHarnessHost` sets `ttlMs` and `renewMs`.
