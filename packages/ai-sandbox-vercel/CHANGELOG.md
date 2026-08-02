# @tanstack/ai-sandbox-vercel

## 0.2.0

### Minor Changes

- [#774](https://github.com/TanStack/ai/pull/774) [`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4) - Two new sandbox provider packages so harness adapters can run **inside** managed cloud sandboxes through the uniform `SandboxHandle`:
  - **`@tanstack/ai-sandbox-daytona`** — `daytonaSandbox()`: runs the agent inside an isolated [Daytona](https://www.daytona.io/) cloud sandbox (`@daytona/sdk`), with `fs`/`exec`/`git`, background processes via Daytona sessions, port preview links (`ports.connect`), and resume-by-id. Requires a Daytona API key (`config.apiKey` or `DAYTONA_API_KEY`).
  - **`@tanstack/ai-sandbox-vercel`** — `vercelSandbox()`: runs the agent inside an isolated [Vercel Sandbox](https://vercel.com/docs/sandbox) microVM (`@vercel/sandbox`), with `fs`/`exec`/`git`, detached background processes, exposed-port domains (`ports.connect`), and resume-by-id. Requires a Vercel access token (`config.token` or `VERCEL_TOKEN` / `VERCEL_OIDC_TOKEN`) plus team/project scope.

  Both providers advertise `writableStdin: false` (background-process stdin is delivered via a file + shell redirect, not a live stream) and reuse the shared `createExecBackedGit` helper for a uniform `sandbox.git` surface.

### Patch Changes

- [#774](https://github.com/TanStack/ai/pull/774) [`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4) - Fix `create()` failing with HTTP 400 `"cannot create directory '/vercel/sandbox': File exists"` when the workspace directory already exists. The Vercel SDK's native `mkDir` is not idempotent and the default workdir ships in the runtime image, so a fresh sandbox already has it. An "already exists" failure is now treated as success while other filesystem errors still surface.

- Updated dependencies [[`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4), [`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4), [`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4), [`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4), [`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4)]:
  - @tanstack/ai-sandbox@0.2.0
