---
name: ai-sandbox
description: >
  Run harness adapters (Claude Code, Codex, Gemini CLI, OpenCode) INSIDE
  isolated sandboxes via defineSandbox + withSandbox + a provider
  (localProcessSandbox / dockerSandbox). Covers declarative provisioning:
  createSecrets + secret/bearer, skills (agentSkill/gitSkill/mcpSkill/
  fileSkill), plugins, instructions → canonical AGENTS.md + symlinks projected
  per harness; shallow-clone default with depth opt-out; serial/parallel setup
  callback over a persistent shell; snapshot-after-setup default with
  snapshotMaxAge TTL; defineWorkspace (git/setup/scripts/skills/secrets/
  instructions/plugins), defineSandboxPolicy (allow/ask/deny), lifecycle/resume,
  the SandboxHandle (fs/git/process/ports), capability tokens, defineSandbox
  hooks (onFile/onFileCreate/onFileChange/onFileDelete/onReady/onError/
  onDestroy) + fileEvents flag, chat middleware sandbox group
  (defineChatMiddleware sandbox hooks), the sandbox debug category,
  watchWorkspace as a low-level building block, and the file.changed /
  sandbox.file / claude-code.session-id events. Use whenever a harness adapter
  needs a sandbox or when building sandbox providers.
type: sub-skill
library: tanstack-ai
library_version: '0.1.0'
sources:
  - 'TanStack/ai:docs/sandbox/overview.md'
---

# Sandboxes

Harness adapters declare `requires: [SandboxCapability]`. `chat()` errors unless
some middleware provides it — `withSandbox(...)` does. The adapter then runs the
agent CLI **inside** the sandbox and streams its events back.

## Setup — Claude Code in a Docker sandbox

```typescript
import { chat } from '@tanstack/ai'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import {
  defineSandbox,
  defineWorkspace,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

const sandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  workspace: defineWorkspace({
    source: { type: 'git', url: 'https://github.com/owner/repo', ref: 'main' },
    packageManager: 'pnpm',
    setup: ['corepack enable', 'pnpm install'],
    scripts: { test: 'pnpm test' },
    secrets: { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? '' },
  }),
  lifecycle: { reuse: 'thread', snapshot: 'after-setup', keepAlive: '30m' },
})

const stream = chat({
  threadId,
  adapter: claudeCodeText('sonnet'),
  messages,
  middleware: [withSandbox(sandbox)],
})
```

## Type-safe secrets

```typescript
import { createSecrets, bearer } from '@tanstack/ai-sandbox'

const secrets = createSecrets({
  GH: process.env.GH_TOKEN ?? '',
  SENTRY: process.env.SENTRY_TOKEN ?? '',
})
// secrets.GH is a SecretRef — the underlying string is stored in a
// non-enumerable symbol-keyed registry and never logged, snapshotted,
// or written to the sandbox store.
```

Pass `secrets` to `defineWorkspace({ secrets })` so skill and MCP projectors
can resolve them. Use `secret: secrets.GH` in `gitSkill` for private-repo auth
and `secrets.GH` / `bearer(secrets.GH)` in MCP header values:

- `secrets.GH` — resolves to the raw token value.
- `bearer(secrets.GH)` — resolves to `"Bearer <value>"`.

## Declarative provisioning (skills, plugins, MCP, instructions)

```typescript
import {
  agentSkill,
  gitSkill,
  mcpSkill,
  fileSkill,
  bearer,
  createSecrets,
  defineWorkspace,
} from '@tanstack/ai-sandbox'

const secrets = createSecrets({ GH: process.env.GH_TOKEN ?? '' })

defineWorkspace({
  source: { type: 'git', url: 'https://github.com/owner/repo' },
  secrets,
  skills: [
    agentSkill('tanstack'), // named skill (no-op with warning on CLIs that lack the concept)
    gitSkill({
      repo: 'owner/private-skills',
      secret: secrets.GH, // resolved at bootstrap time, never stored
      // into: '/abs/path/inside/sandbox'  // optional; defaults to .tanstack-skills/<repo>
    }),
    mcpSkill('my-mcp', {
      url: 'https://mcp.example.com',
      headers: { Authorization: bearer(secrets.GH) },
    }),
    fileSkill({ path: '.hints.md', content: 'Prefer pnpm.' }),
  ],
  plugins: ['@anthropic/plugin-foo'], // no-op with warning on CLIs without a plugin concept
  instructions: 'Always run `pnpm test` before proposing a change.',
})
```

Each skill type is projected per harness (Claude Code → `.mcp.json`; Codex →
`.codex/config.toml`; Gemini CLI → settings JSON; OpenCode → `opencode.json`).
`instructions` is written as `AGENTS.md` at the workspace root; `CLAUDE.md` and
`GEMINI.md` are created as symlinks (falling back to copies on symlink failure).
Skills/plugins that a CLI lacks emit a `console.warn` and are skipped.

**`gitSkill` `into` field:** an **absolute path inside the sandbox** where the
repo is cloned. Defaults to `<root>/.tanstack-skills/<repo-basename>`.

## Fast init

### Shallow clone (`depth`)

`githubRepo` / `gitSource` default to `--depth 1 --single-branch`. Override:

```typescript
import { githubRepo, defineWorkspace } from '@tanstack/ai-sandbox'

defineWorkspace({ source: githubRepo({ repo: 'owner/app' }) }) // depth 1 (default)
defineWorkspace({ source: githubRepo({ repo: 'owner/app', depth: 10 }) }) // 10 commits
defineWorkspace({ source: githubRepo({ repo: 'owner/app', depth: 'full' }) }) // full history
```

### Serial / parallel `setup` callback

`setup` accepts a plain `Array<string>` (all serial) or a callback that records
serial and parallel groups over a **persistent shell** whose cwd/env carry over
between serial steps:

```typescript
defineWorkspace({
  source: githubRepo({ repo: 'owner/app' }),
  setup: ({ serial, parallel }) => {
    serial('corepack enable')
    serial('pnpm install')
    parallel(['pnpm build', 'pnpm typecheck']) // concurrent; inherit cwd+env from shell
    serial('echo done')
  },
})
```

### Snapshot-after-setup and `snapshotMaxAge`

When the provider supports snapshots, bootstrap takes one automatically after
`setup` completes. Subsequent runs resume from the snapshot (skipping setup).
Override or add a TTL:

```typescript
lifecycle: {
  snapshot: 'after-setup', // default when provider.capabilities().snapshots
  snapshotMaxAge: '24h',   // re-create when the snapshot is older than this
}
```

Providers without snapshot support skip the step silently.

## Providers

- `localProcessSandbox()` — runs on the host (no isolation; dev loop only).
- `dockerSandbox({ image })` — isolated container; snapshots, fork, resume-by-id.

Both implement the same `SandboxHandle`: `fs` (read/write/list/mkdir/remove/
rename/exists), `git` (clone/status/add/commit/push/pull/branch), `process`
(`exec` + duplex `spawn`), `ports.connect(port)`, `env.set`, optional
`snapshot()`/`fork()`, `destroy()`. Providers advertise support via
`capabilities()`; calling an unsupported optional method throws
`UnsupportedCapabilityError`.

## Policy

```typescript
import { defineSandboxPolicy } from '@tanstack/ai-sandbox'

const policy = defineSandboxPolicy({
  commands: {
    allow: ['pnpm test'],
    ask: ['curl *'],
    deny: ['sudo *', 'rm -rf *'],
  },
  capabilities: { fileWrite: 'allow', network: 'ask' },
  default: 'ask', // deny > ask > allow
})
// pass to defineSandbox({ policy }); harness adapters map it to native permissions
```

## Lifecycle &amp; resume

`reuse: 'thread'` resumes one sandbox per `threadId`; the compound key folds in
provider + workspace hash + tenant so changing the repo/setup/image starts
fresh. Ensure order: resume running → restore snapshot → create + bootstrap.

## File-event hooks

Watch the workspace for create/change/delete events. Provider-agnostic: native
`fs.watch` on local-process, a portable `find` poll on Docker/exec-only
providers (no extra deps or image changes).

Declare hooks on `defineSandbox({ hooks })` (sandbox-scoped) or on any chat
middleware via the `sandbox` group (run-scoped):

```typescript
import {
  defineSandbox,
  defineChatMiddleware,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { dockerSandbox } from '@tanstack/ai-sandbox-docker'

// Sandbox-scoped hooks (all optional):
const sandbox = defineSandbox({
  id: 'repo-agent',
  provider: dockerSandbox({ image: 'node:22' }),
  hooks: {
    onFile: (e) => console.log(e.type, e.path), // catch-all
    onFileCreate: (e) => console.log('created', e.path),
    onFileChange: (e) => console.log('changed', e.path),
    onFileDelete: (e) => console.log('deleted', e.path),
    onReady: (handle) => console.log('ready', handle.id),
    onError: (err) => console.error(err),
    onDestroy: () => console.log('destroyed'),
  },
  fileEvents: true, // default; set false to disable watching entirely
})

// Run-scoped hooks via chat middleware (ctx is ChatMiddlewareContext):
const auditMiddleware = defineChatMiddleware({
  name: 'audit',
  sandbox: {
    onFile: (ctx, e) => console.log(ctx.runId, e.type, e.path),
    onFileCreate: (ctx, e) => db.log({ run: ctx.runId, event: e }),
    onFileChange: (ctx, e) => metrics.increment('file.change'),
    onFileDelete: (ctx, e) => console.warn('deleted', e.path),
  },
})

// No extra middleware needed — sandbox.file CUSTOM events are emitted
// automatically. Read them from the stream:
for await (const chunk of stream) {
  if (chunk.type === 'CUSTOM' && chunk.name === 'sandbox.file') {
    const value = chunk.value
    if (
      value !== null &&
      typeof value === 'object' &&
      'type' in value &&
      'path' in value
    ) {
      console.log('file event', value) // { type, path, timestamp }
    }
  }
}
```

`watchWorkspace()` is available as a low-level building block for watching
outside a `chat()` run:

```typescript
import { watchWorkspace } from '@tanstack/ai-sandbox'

const watcher = await watchWorkspace(handle, {
  onEvent: (e) => console.log(e.type, e.path),
  ignore: ['.git', 'node_modules'], // default
})
await watcher.stop()
```

Enable the `sandbox` debug category to log watcher start/stop, event dispatch,
and lifecycle transitions:

```typescript
chat({ threadId, adapter, messages, debug: { sandbox: true } })
// or debug: true to enable all categories
```

## Edge / serverless execution

A request-scoped Worker can't hold a multi-minute agent run open. The
serverless/edge model splits this: a **trigger** starts the run and returns
immediately, a **durable orchestrator** drives it, and clients **tail from a
resumable cursor**.

Core primitives (`@tanstack/ai-sandbox`, transport- and runtime-agnostic):

- **`RunEventLog` / `InMemoryRunEventLog`** — append-only, `seq`-indexed log of a
  run's `StreamChunk`s with replay-then-tail reads. A dropped connection / new
  tab / hibernated orchestrator reconnect by passing their last-seen `seq`
  (`read({ fromSeq })`). `TerminalRunStatus` = `done | error | aborted`.
- **`pipeToRunLog` / `RunController`** — the run driver. `pipeToRunLog` pumps a
  `chat()` stream into a log and **never rejects**: a thrown stream error becomes
  a terminal `RUN_ERROR` event, so detached clients always observe failures.
  `RunController.start` is fire-and-track; `attach(runId, { fromSeq })` tails;
  `drain()` awaits in-flight runs (e.g. in a `waitUntil`).
- **Transport-agnostic tool-bridge** — `createToolBridgeCore` +
  `handleBridgeJsonRpc` are the portable core; `startHostToolBridge` is the
  `node:http` host transport. The `ToolBridgeProvisioner` capability injects the
  transport, so an edge orchestrator serves the same core from its own `fetch`
  handler (no raw TCP listener). Default = host transport.
- **Co-located host-tool seam** — `toolDescriptors` / `remoteToolStubs` /
  `httpRemoteToolExecutor` (container side) + `executeHostTool` (orchestrator
  side): only chat()-tool EXECUTION crosses the container→orchestrator boundary,
  not the whole MCP protocol.
- **`SandboxCapabilities.writableStdin`** — `false` for providers (e.g.
  Cloudflare) with no writable host→process stdin; stdin-fed harnesses then
  deliver the prompt via a file + in-shell redirection (`claude -p … < file`).

Cloudflare runtime (`@tanstack/ai-sandbox-cloudflare`):

- `createCloudflareSandboxAgent(config)` → `{ Coordinator, Sandbox, worker }` —
  an app's `worker.ts` is one configured call plus the wrangler-required DO
  re-exports. Two models via `mode`: `do-drives` (the DO runs `chat()`) and
  `colocated` (harness + bridge run in-container; the DO is a thin coordinator,
  pair with `runInContainerHarness` from `/runner`).
- `DurableObjectRunEventLog` mirrors `InMemoryRunEventLog` over DO storage;
  `timingSafeBearerEqualWeb` is the Web-Crypto constant-time bearer check.

## Events

- `claude-code.session-id` (CUSTOM) — resumable session id → pass back via
  `modelOptions.sessionId`.
- `file.changed` (CUSTOM) — `{ path, diff }` working-tree diff after the run.
- `sandbox.file` (CUSTOM) — `{ type, path, timestamp }` per file create/change/
  delete, emitted automatically when a sandbox is active.

## Critical rules

- **Harness adapters require a sandbox.** Always include `withSandbox(...)` in
  `middleware` — without it `chat()` throws a missing-capability error.
- **Secrets** (`workspace.secrets`) are injected into the sandbox env and never
  persisted (no snapshots, no sandbox store, no event log). Always create them
  with `createSecrets(...)` so the values stay hidden behind `SecretRef` tokens.
  The agent binary (`claude`) must exist in the sandbox image (install it in
  `setup` or bake it into the image).
- **Secret-bearing projected files** (e.g. MCP config with resolved header
  values) are re-written on every projection call so rotated secrets re-apply;
  they are never included in a snapshot.
- **chat()-provided `tools` are bridged** into the in-sandbox agent over a
  host-side MCP tool-proxy: the agent calls them as `mcp__tanstack__<tool>` and
  each call is proxied back to the host where the tool's `execute()` runs (with
  its closures / DB / secrets). The agent also has its own native tools
  (Bash/Edit/Read/…). The host bridge binds on the host; the sandbox reaches it
  (localhost, or `host.docker.internal` for Docker), gated by a per-run bearer
  token.
- Use `localProcessSandbox()` only in trusted/dev contexts (no isolation).
- Skills/plugins that a CLI lacks (e.g. `agentSkill` on Codex, `plugins` on
  Codex) warn and skip — they do not throw.
