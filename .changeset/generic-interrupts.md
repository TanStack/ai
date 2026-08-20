---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
'@tanstack/ai-react': minor
'@tanstack/ai-preact': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-svelte': minor
'@tanstack/ai-angular': minor
'@tanstack/ai-persistence': minor
---

Add first-party generic interrupts.

Use `defineInterrupt()` to describe a pause, register it on `chat()` and the client hooks, and return requests from `onInterruptBoundary`. The client gets typed payloads and `resolveInterrupt`. Resume validates the answer and runs `onInterruptResolution`.

`GenericInterrupt<typeof reviewPlan>` types one bound card. `INTERRUPT_BOUNDARY_PHASES` and `INTERRUPT_TOOL_RESUMES` are the shared phase and resume lists.
