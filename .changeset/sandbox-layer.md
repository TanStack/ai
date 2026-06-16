---
'@tanstack/ai-sandbox': minor
'@tanstack/ai-sandbox-local-process': minor
'@tanstack/ai-sandbox-docker': minor
'@tanstack/ai': minor
---

New provider-agnostic sandbox layer so harness adapters can run **inside** isolated sandboxes.

- **`@tanstack/ai-sandbox`** — `defineSandbox()` (lazy controller + resume→restoreSnapshot→create+bootstrap ensure algorithm), `withSandbox()` middleware, `defineWorkspace()` (git/local source, package-manager detection, setup, skills, secrets), `defineSandboxPolicy()`, the `SandboxProvider`/`SandboxHandle`/`SandboxCapabilities` contracts, capability tokens (`SandboxCapability` plus the optional `SandboxStore`/`Locks` persistence seams with in-memory defaults), `bootstrapWorkspace`, `createExecBackedGit`, and `spawnNdjson` (run an agent CLI in a sandbox and stream its NDJSON stdout).
- **`@tanstack/ai-sandbox-local-process`** — `localProcessSandbox()`: runs the agent on the host through the uniform `SandboxHandle` (no isolation; the fast dev loop).
- **`@tanstack/ai-sandbox-docker`** — `dockerSandbox()`: runs the agent inside an isolated Docker container (dockerode), with commit-based snapshots, fork, and resume-by-id.
- **`@tanstack/ai`** — `TextOptions.capabilities` exposes the middleware capability context to adapters so harness adapters that declare `requires: [...]` can read provided capabilities from `chatStream`; `DefinedChatMiddleware` and `AnyChatMiddleware` are now exported for portable middleware authoring.
