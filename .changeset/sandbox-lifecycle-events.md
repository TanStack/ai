---
'@tanstack/ai': minor
'@tanstack/ai-sandbox': minor
---

`withSandbox` now sends a `sandbox.starting` CUSTOM event before it creates or resumes the sandbox. Then it sends `sandbox.created` or `sandbox.resumed`. Use these events to show a pending state in the client while the sandbox starts.

New in `@tanstack/ai`: `CUSTOM_EVENT.SANDBOX_STARTING`, the `SandboxStartingPayload` type, and the typed `SandboxStartingEvent`, `SandboxCreatedEvent`, and `SandboxResumedEvent` members of `KnownCustomEvent`.
