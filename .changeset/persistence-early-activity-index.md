---
'@tanstack/ai-persistence': patch
---

Put a new activity row that sits after every request message after every merged message. Before, `withPersistence` kept the index such a row had against the request alone. This happened on every run with an event sent from `setup` (for example `withSandbox`'s `sandbox.starting`), because that event starts the run before the stored thread is merged. On reload, the run's activity row then showed near the top of the thread.
