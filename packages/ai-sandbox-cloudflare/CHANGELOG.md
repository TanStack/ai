# @tanstack/ai-sandbox-cloudflare

## 0.2.4

### Patch Changes

- Updated dependencies [[`3e1b510`](https://github.com/TanStack/ai/commit/3e1b510e4fdd2334af468c47b7c37b572805200e)]:
  - @tanstack/ai@0.42.0
  - @tanstack/ai-sandbox@0.2.4
  - @tanstack/ai-sandbox-local-process@0.2.0

## 0.2.3

### Patch Changes

- Updated dependencies [[`5fcaf90`](https://github.com/TanStack/ai/commit/5fcaf90dc82bc20b8c7a75faa3c129da04858af5), [`2665085`](https://github.com/TanStack/ai/commit/2665085970ab4d792778bb2b635ef27fbdcb6be1), [`1deaa29`](https://github.com/TanStack/ai/commit/1deaa299b560ad1599b9d96cda1d7b7415f9fc4a), [`e0bbbdd`](https://github.com/TanStack/ai/commit/e0bbbdd9608892293e09135aab4a3c77c8d65669), [`f830d9e`](https://github.com/TanStack/ai/commit/f830d9e7a41e3554c424c3e41ba847dfd1577589), [`f830d9e`](https://github.com/TanStack/ai/commit/f830d9e7a41e3554c424c3e41ba847dfd1577589), [`de5fbb5`](https://github.com/TanStack/ai/commit/de5fbb52a916826cdc0ef31d18df402cd611b9d4)]:
  - @tanstack/ai@0.41.0
  - @tanstack/ai-sandbox@0.2.3
  - @tanstack/ai-sandbox-local-process@0.2.0

## 0.2.2

### Patch Changes

- Updated dependencies [[`5deda27`](https://github.com/TanStack/ai/commit/5deda27085c8785894a28feb5bb3655dbd8f7e0a)]:
  - @tanstack/ai@0.40.0
  - @tanstack/ai-sandbox@0.2.2
  - @tanstack/ai-sandbox-local-process@0.2.0

## 0.2.1

### Patch Changes

- [#889](https://github.com/TanStack/ai/pull/889) [`9b58c08`](https://github.com/TanStack/ai/commit/9b58c08258dfb8dc261a0dd1954216cc5a75cc3e) - Give providers a deterministic sandbox id on create.

  `SandboxCreateInput` now carries an optional `id`, and `ensure()` passes the
  compound sandbox key into `provider.create()`. Providers whose native id is
  addressable by name **and** expose a preview URL keyed by that id — Cloudflare
  (DO id) and Sprites (sprite name) — honor it (`input.id ?? <random>`), so
  out-of-band consumers (e.g. attaching a preview iframe) can reconstruct the
  exact sandbox an agent is editing from run context instead of the random id
  previously recoverable only from the sandbox store. Providers that mint their
  own opaque id (Daytona, Vercel) ignore it, so behavior is unchanged for them.

- Updated dependencies [[`afba322`](https://github.com/TanStack/ai/commit/afba32236022589afce4d5a165fd4a8a884ae57d), [`9b58c08`](https://github.com/TanStack/ai/commit/9b58c08258dfb8dc261a0dd1954216cc5a75cc3e), [`e7ad181`](https://github.com/TanStack/ai/commit/e7ad181cad20c5d6560f480835c99ff1142b40af)]:
  - @tanstack/ai@0.39.1
  - @tanstack/ai-sandbox@0.2.1
  - @tanstack/ai-sandbox-local-process@0.2.0

## 0.2.0

### Minor Changes

- [#774](https://github.com/TanStack/ai/pull/774) [`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4) - New `@tanstack/ai-sandbox-cloudflare` package: a Cloudflare Containers sandbox provider (`cloudflareSandbox`) built on `@cloudflare/sandbox`, for running harness adapters at the edge inside a Worker. Implements the uniform `SandboxHandle` (exec, base64-backed fs, git, `exposePort` preview URLs, env) over the Cloudflare Sandbox Durable Object. The container disk is ephemeral and snapshots are not yet GA, so `withSandbox` re-bootstraps under the same identity across cold starts (`durableFilesystem`/`snapshots` are reported false). Background processes don't expose stdin on Cloudflare, so stdin-fed harnesses (e.g. Claude Code) need a stdin-capable provider; `exec` works fully.

- [#774](https://github.com/TanStack/ai/pull/774) [`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4) - Make the Cloudflare sandbox factory **harness-agnostic about auth**. `SandboxAgentEnv` / `ContainerCoordinatorEnv` no longer bind a hardcoded `ANTHROPIC_API_KEY` field, and neither the do-drives default sandbox nor the colocated container runner injects an Anthropic key anymore. Instead the run's workspace **declares** the secret names it needs (via `createSecrets`), and the coordinator copies each declared name out of the Worker `env` into the sandbox/container env — so a Claude Code app declares `ANTHROPIC_API_KEY`, a Codex app declares `CODEX_API_KEY`, and the package binds no key of its own.

  **Breaking:** apps that relied on the implicit `ANTHROPIC_API_KEY` field must now add it to their own env type and supply it via a `sandbox`/`workspace` resolver, e.g.:

  ```ts
  interface AppEnv extends SandboxAgentEnv {
    ANTHROPIC_API_KEY: string
  }
  createCloudflareSandboxAgent<AppEnv>({
    adapter: () => claudeCodeText('sonnet'),
    sandbox: (input, env) =>
      defineSandbox({
        // …
        workspace: defineWorkspace({
          source: { type: 'none' },
          secrets: createSecrets({ ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY }),
        }),
      }),
  })
  ```

- [#774](https://github.com/TanStack/ai/pull/774) [`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4) - Serverless/edge run model for the sandbox layer — a trigger can start an agent run and return immediately while a durable orchestrator drives it and clients tail the stream from a resumable cursor.
  - **Resumable run event-log** (`RunEventLog`, `InMemoryRunEventLog`, `RunEvent`, `RunRecord`, `isTerminalRunStatus`) — an append-only, `seq`-indexed log of a run's `StreamChunk`s with replay-then-tail reads. A dropped connection, a new tab, or an orchestrator that hibernated between chunks all reconnect by passing their last-seen `seq`. The run never depends on a single open connection.
  - **Run driver** (`pipeToRunLog`, `RunController`) — pumps a `chat()` stream into a `RunEventLog` (status transitions, RUN_ERROR capture, abort handling), and a controller that starts a run without blocking, exposes a resumable `attach(runId, { fromSeq })`, and `drain()`s in-flight runs for `waitUntil`-style flushing.
  - **Transport-agnostic tool-bridge** — the MCP tool-proxy is split into a portable core (`createToolBridgeCore`, `handleBridgeJsonRpc`) and a transport. `startHostToolBridge` remains the `node:http` host transport (now loopback-bound unless a Docker container must reach it, with a constant-time bearer check); a serverless/edge orchestrator serves the same core from its own `fetch` handler — no raw TCP listener. A new `ToolBridgeProvisioner` capability (`getToolBridgeProvisioner` / `provideToolBridgeProvisioner`, default `nodeHttpBridgeProvisioner`) lets the orchestrator inject the transport.
  - **Harness adapters inverted** — `claude-code`, `codex`, and `opencode` now resolve their tool-bridge from the `ToolBridgeProvisioner` capability (defaulting to the host transport) instead of hardcoding `node:http`, so they run unchanged on the host and on the edge.
  - **Claude Code runs on the Cloudflare sandbox** — a new required `SandboxCapabilities.writableStdin` flag lets a provider advertise whether spawned processes have a writable host→process stdin — `true` for the host/Docker/local-process providers, `false` for Cloudflare. The Claude Code adapter detects `false` and delivers the prompt via a file + in-shell stdin-redirection (`claude -p … < file`) instead of a host stdin write, keeping it out of argv. Host/Docker behaviour is unchanged (stdin path).
  - **Tool-bridge token hardening** — the per-run bearer token is no longer passed inline in argv. The Claude Code adapter writes the bridge MCP config to a file and passes claude the path (`--mcp-config <file>`), so the token can't be read from `ps` / `/proc/<pid>/cmdline` by other processes in the sandbox.
  - **Co-located ("combined") run model** — new `@tanstack/ai-sandbox` exports (`remoteToolStubs`, `toolDescriptors`, `httpRemoteToolExecutor`, `executeHostTool`, plus the `RemoteToolExecutor` interface) let the harness loop AND its MCP tool-bridge run INSIDE the container (the in-container sandbox is just `local-process`, with native stdin + a localhost `node:http` bridge). The orchestrator serializes its tools with `toolDescriptors`; the container rebuilds them as delegating stubs with `remoteToolStubs(descriptors, httpRemoteToolExecutor(url, token))`; the orchestrator answers that one call with `executeHostTool(tools, name, args)`. Only host-tool **execution** crosses the container→orchestrator boundary — the MCP transport itself never leaves the container, shrinking the public surface from the whole MCP protocol to a single authenticated tool-exec call.
  - **Request-derived callback hosts, split into bridge vs preview (`resolveBridgeOrigin` / `resolvePreviewHost`)** — the off-isolate sandbox container reaches the Worker over two distinct surfaces, now resolved separately (both exported from `@tanstack/ai-sandbox-cloudflare/agent`; the Worker captures the trigger host as `StartRunInput.publicHost`):
    - **Bridge / tool-exec** (container → Worker): `PUBLIC_HOSTNAME` is **optional** — unset → derived from the `POST /runs` request, which is safe on Cloudflare (the edge only routes hostnames you own to your Worker, so the request host is never an attacker's `Host` and the per-run bearer token can't be steered off-domain). A `*.workers.dev` deploy needs no config; **local dev uses `host.docker.internal`** (the Docker host gateway), so agent runs work locally with **no tunnel**.
    - **Preview** (browser → Worker → container, `exposePort`): a separate `PREVIEW_HOSTNAME`, because preview URLs require **wildcard DNS**. **Local** uses `*.localhost` (browser-resolved to loopback — previews work locally with no tunnel); **deployed** requires a **custom domain** with a `*.<domain>` route. `*.workers.dev` has no wildcard subdomains (the SDK's `exposePort` rejects it), so `resolvePreviewHost` throws a clear error pointing at `PREVIEW_HOSTNAME` rather than returning a dead URL.
  - **Preview wiring is package-provided, not example glue** — `@tanstack/ai-sandbox-cloudflare/agent` now exports `exposePreviewTool(input, env)` (a ready-made `exposePreview` `chat()` server tool) and `PREVIEW_GUIDANCE` (an app-agnostic system prompt), and `createCloudflareSandboxAgent` gains a `systemPrompts` option (do-drives) to wire the guidance in. The tool mints previews via a **Cloudflare quick tunnel** (`sandbox.tunnels.get(port)` → `*.trycloudflare.com`), served by `cloudflared` inside the sandbox — deliberately NOT `exposePort` + `proxyToSandbox`, which routes the preview through the Worker origin (in local dev, your Vite dev server, whose middleware then serves the preview's `/@vite/client` / `/src/*` / `/@fs/*` from the host instead of the container and breaks the page). A tunnel bypasses the Vite port, needs no custom domain on a deploy, and forwards WebSockets (HMR works). `PREVIEW_GUIDANCE` just tells the agent to bind wide and allow all hosts so the tunnel hostname is accepted (Vite `server: { host: true, allowedHosts: true }`). Because `sandbox.tunnels` exists only on the SDK's **RPC** transport (it throws `requires the RPC transport` on the default `http`), `cloudflareSandbox` now defaults to `transport: 'rpc'` (new `transport` config option to override) and applies it to create/resume/destroy; `exposePreviewTool` obtains its stub with `transport: 'rpc'` too. `exposePort` + `resolvePreviewHost` remain available for Worker-fronted previews on a custom domain. Adds `zod` as a peer dependency.
  - **`@tanstack/ai-sandbox-cloudflare` ships the runtime, not just the example** — the Worker router, the coordinator Durable Object, the durable run-log, and the `POST /run` wire contract are now package code, exported from two entries: `@tanstack/ai-sandbox-cloudflare/agent` (Workers-only — `createCloudflareSandboxAgent`, the coordinator base classes, `DurableObjectRunEventLog`, plus the shared `ContainerRunRequest` + `parseContainerRunRequest`), and `@tanstack/ai-sandbox-cloudflare/runner` (Node — `runInContainerHarness`, the in-container `chat()` server that validates the request, builds `chat()` over `localProcessSandbox()`, and streams NDJSON back). An app supplies only its config + an adapter resolver: the co-located example's whole worker + container program collapse to ~14 lines. Adds `@tanstack/ai-sandbox-local-process` as a peer dependency (used by the `/runner` entry).

  See `examples/sandbox-cloudflare` for the Worker → Durable Object → Container reference — a TanStack Start app that ships the UI, the agent, the coordinator DO, and the container in one Worker (trigger returns immediately; the DO coordinates, persists to a DO-backed `RunEventLog`, serves the bridge from its `fetch` handler, and streams to clients over a hibernatable WebSocket). The co-located variant (harness + bridge in the container; only `executeHostTool` crosses back) is a supported package mode — `createCloudflareSandboxAgent({ mode: 'colocated' })` plus a one-`runInContainerHarness`-call container program — documented in `docs/sandbox/overview.md`.

### Patch Changes

- [#774](https://github.com/TanStack/ai/pull/774) [`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4) - Fix the Claude Code harness never starting its turn in a Cloudflare sandbox (runs sat at `status:running` forever, streaming nothing). Two root causes:
  - **`@tanstack/ai-claude-code`**: the adapter defaults `--permission-mode bypassPermissions`, which Claude Code maps to `--dangerously-skip-permissions` and refuses to run as root. Sandbox containers (Docker/Cloudflare) run as root, so `claude` died instantly. The adapter now sets `IS_SANDBOX=1` in the CLI's environment (Claude Code's documented escape hatch for running skip-permissions in an isolated environment), merged over any caller-provided env.
  - **`@tanstack/ai-sandbox-cloudflare`**: `spawn()` used `@cloudflare/sandbox`'s background-process API (`startProcess` + `streamProcessLogs`), whose `onOutput`/`onExit` callbacks never fire, so a stdout-NDJSON harness hung forever. `spawn()` now streams over `exec({ stream: true, onOutput })` — the same proven command path as one-shot `exec` — and resolves the exit code from its result. The caller's `AbortSignal` is no longer forwarded across the Durable Object RPC boundary (Workers RPC cannot serialize an `AbortSignal`, which previously threw before the command ran); mid-run cancellation is unavailable on this provider and a stuck run is bounded by the coordinator watchdog instead. A failed command now rejects `wait()` so the adapter surfaces a `RUN_ERROR` rather than a silent zero-output run.

- Updated dependencies [[`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4), [`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4), [`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4), [`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4), [`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4)]:
  - @tanstack/ai-sandbox@0.2.0
  - @tanstack/ai@0.39.0
  - @tanstack/ai-sandbox-local-process@0.2.0
