# @tanstack/ai-sandbox

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

- Updated dependencies [[`afba322`](https://github.com/TanStack/ai/commit/afba32236022589afce4d5a165fd4a8a884ae57d), [`e7ad181`](https://github.com/TanStack/ai/commit/e7ad181cad20c5d6560f480835c99ff1142b40af)]:
  - @tanstack/ai@0.39.1

## 0.2.0

### Minor Changes

- [#774](https://github.com/TanStack/ai/pull/774) [`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4) - Declarative sandbox file-event hooks: observe file create / change / delete
  inside a sandbox and have them fire automatically during a chat run.
  - `@tanstack/ai`: chat middleware gains an optional `sandbox` hook group
    (`onFile`/`onFileCreate`/`onFileChange`/`onFileDelete`), a `SandboxFileEvent`
    type, and a `sandbox` debug-logging category. The engine auto-emits a
    `CUSTOM` `sandbox.file` event per change (client reads it from `parts`).
  - `@tanstack/ai-sandbox`: `defineSandbox({ hooks, fileEvents })` declares
    file + lifecycle hooks (`onFile*`/`onReady`/`onError`/`onDestroy`) that fire
    automatically while the sandbox runs in a chat — `withSandbox` owns the
    watcher. The watcher is provider-agnostic: a native `fs.watch` fast-path when
    the provider advertises it, otherwise a portable `find -printf` mtime
    snapshot-diff poll (no extra deps; `.git`/`node_modules` ignored by default).
    `watchWorkspace()` / `diffSnapshots` remain as low-level building blocks.
  - `@tanstack/ai-sandbox-local-process`: implements the optional `fs.watch` seam
    via Node's recursive `fs.watch` (Windows/macOS); Linux falls back to the core
    exec-poll automatically.

- [#774](https://github.com/TanStack/ai/pull/774) [`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4) - New provider-agnostic sandbox layer so harness adapters can run **inside** isolated sandboxes.
  - **`@tanstack/ai-sandbox`** — `defineSandbox()` (lazy controller + resume→restoreSnapshot→create+bootstrap ensure algorithm), `withSandbox()` middleware, `defineWorkspace()` (git/local source, package-manager detection, setup, skills, secrets), `defineSandboxPolicy()`, the `SandboxProvider`/`SandboxHandle`/`SandboxCapabilities` contracts, capability tokens (`SandboxCapability` plus the optional `SandboxStore`/`Locks` persistence seams with in-memory defaults), `bootstrapWorkspace`, `createExecBackedGit`, `spawnNdjson` (run an agent CLI in a sandbox and stream its NDJSON stdout), the host MCP tool-proxy bridge (`startHostToolBridge` — exposes `chat()` server tools to the in-sandbox agent, with an optional permission-prompt tool), and the shared interactive-approval primitives (`resolveApproval`, `approvalId`, `buildApprovalRequestedEvent`) harness adapters use to enforce a policy and surface `approval-requested` events for client-in-the-loop approvals.
  - **`@tanstack/ai-sandbox-local-process`** — `localProcessSandbox()`: runs the agent on the host through the uniform `SandboxHandle` (no isolation; the fast dev loop).
  - **`@tanstack/ai-sandbox-docker`** — `dockerSandbox()`: runs the agent inside an isolated Docker container (dockerode), with commit-based snapshots, fork, and resume-by-id.
  - **`@tanstack/ai`** — `TextOptions.capabilities` exposes the middleware capability context to adapters so harness adapters that declare `requires: [...]` can read provided capabilities from `chatStream`; `TextOptions.approvals` threads client approval decisions through to adapters for the interactive-approval (deny + `approval-requested` + re-run) flow; `DefinedChatMiddleware` and `AnyChatMiddleware` are now exported for portable middleware authoring.

- [#774](https://github.com/TanStack/ai/pull/774) [`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4) - Declarative sandbox provisioning + faster headless init.
  - **`createSecrets`**: type-safe secret references; underlying values are stored
    in a non-enumerable symbol-keyed registry and never written to snapshots, the
    sandbox store, or the event log. Use `secret: secrets.GH` in `gitSkill` for
    private-repo auth and `bearer(secrets.GH)` in MCP header values.
  - **Declarative `skills` / `plugins` / `instructions`**: `agentSkill`,
    `gitSkill` (private-repo clone with `secret`), `mcpSkill` (MCP server with
    resolved header values), and `fileSkill` are projected per harness into each
    CLI's native format (Claude Code `.mcp.json`, Codex `.codex/config.toml`,
    OpenCode `opencode.json`). `instructions` is written
    as a canonical `AGENTS.md` at the workspace root; `CLAUDE.md` and `GEMINI.md`
    are symlinked (copy fallback). Concepts a CLI lacks emit a warning and are
    skipped rather than throwing.
  - **Shallow clone by default**: `githubRepo`/`gitSource` default to
    `--depth 1 --single-branch`. Pass `depth: number` for a specific history
    depth or `depth: 'full'` to disable the flag.
  - **Serial/parallel `setup` callback**: `setup` accepts a plain `Array<string>`
    (all serial) or a `({ serial, parallel }) => void` callback that records
    groups run over a persistent shell — the shell's cwd and env carry over
    between serial steps; `parallel([...])` launches commands concurrently
    using the shell's forked state.
  - **Default snapshot-after-setup**: when the provider supports snapshots,
    bootstrap takes one automatically after `setup` completes. Add
    `lifecycle.snapshotMaxAge` (e.g. `'24h'`) to re-create the sandbox when the
    snapshot is older than the TTL.
  - **`@tanstack/ai-sandbox-docker` fix**: a spawned process's demuxed
    stdout/stderr now end on the exec stream's `close`/`error` (not only `end`),
    so disposing a long-lived process (e.g. the bootstrap shell) no longer hangs
    after `kill()`.

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

- [#774](https://github.com/TanStack/ai/pull/774) [`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4) - Fix workspace bootstrap on sandbox providers without a writable stdin
  (`capabilities.writableStdin === false`, e.g. Daytona / Vercel / Cloudflare):
  - The bootstrap shell previously **always** drove setup commands over a spawned
    process's stdin (a sentinel-echo protocol), which those providers reject — so
    any `defineWorkspace({ setup })` step threw `stdin is not writable`. The
    bootstrap shell now falls back to an **exec-backed** implementation that
    threads `cwd`/exported env across discrete `process.exec` calls, reproducing
    the persistent-shell semantics without stdin.
  - `defineSandbox().ensure()` now **destroys the freshly-created sandbox if
    bootstrap fails** (before it has been recorded), instead of leaking an
    orphaned — and, for hosted providers, billed — sandbox on a failed/retried run.

- Updated dependencies [[`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4), [`b628a4d`](https://github.com/TanStack/ai/commit/b628a4da5fd21184922c6944059768d1ed6071d4)]:
  - @tanstack/ai@0.39.0
