---
name: ai-sandbox
description: >
  Run harness adapters (Claude Code, Codex, OpenCode) INSIDE
  isolated sandboxes via defineSandbox + withSandbox + a provider
  (localProcessSandbox / dockerSandbox). Covers declarative provisioning:
  createSecrets + secret/bearer, skills (agentSkill/gitSkill/mcpSkill/
  fileSkill), plugins, instructions → canonical AGENTS.md + symlinks projected
  per harness; shallow-clone default with depth opt-out; serial/parallel setup
  callback over a persistent shell; snapshot-after-setup default with
  snapshotMaxAge TTL. It also covers portable snapshots after a successful
  terminal run with withPersistence before withSandbox and
  memorySandboxSnapshots for local examples. It covers named saves with
  snapshots.save, selected-checkpoint forks with snapshots.fork, and
  authorized artifact reads with snapshots.readArtifact. It covers defineWorkspace
  (git/setup/scripts/skills/secrets/
  instructions/plugins), defineSandboxPolicy (allow/ask/deny), lifecycle/resume,
  the SandboxHandle (fs/git/process/ports), capability tokens, defineSandbox
  hooks (onFile/onFileCreate/onFileChange/onFileDelete/onReady/onError/
  onDestroy) + fileEvents flag, chat middleware sandbox group
  (defineChatMiddleware sandbox hooks), the sandbox debug category,
  watchWorkspace as a low-level building block, the file.changed /
  sandbox.file / claude-code.session-id events, and the run journal
  (spawnNdjson journal option, runId uniqueness, follow vs bounded-poll
  reading, alignToStoredLog replay alignment, chunkFingerprint,
  createRunScopedIdGen), and takeover of detached runs (withSandbox
  runs+durability as one opt-in, detach vs cancel via requestRunCancel /
  RUN_CANCEL_REASON, sandboxRunDriver on the resume path, single-writer fencing
  of BOTH the event log and the run record, replay-from-zero with
  JournalReplayDivergedError, the distributed LockStore requirement). Use
  whenever a harness adapter needs a sandbox or when building sandbox providers.
type: sub-skill
library: tanstack-ai
library_version: '0.2.4'
sources:
  - 'TanStack/ai:docs/sandbox/overview.md'
  - 'TanStack/ai:docs/sandbox/takeover.md'
  - 'TanStack/ai:docs/sandbox/reaping.md'
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
`.codex/config.toml`; OpenCode → `opencode.json`).
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

### Portable sandbox snapshots

Portable snapshots keep completed workspace files in application persistence.
They are separate from provider-native bootstrap snapshots. Configure the
middleware in this order, with the same persistence value in both places:

```typescript
import { withPersistence } from '@tanstack/ai-persistence'
import { memorySandboxSnapshots, withSandbox } from '@tanstack/ai-sandbox'

const snapshots = await memorySandboxSnapshots({ sandbox, instances })

const middleware = [
  withPersistence(snapshots.persistence),
  withSandbox(sandbox, { instances, snapshots }),
]
```

Each successful terminal run saves regular files, empty directories, durable
conversation data, and persisted thread artifacts. A later run restores the
latest checkpoint only into a new private sandbox. A live resumed sandbox is
never overwritten. The default policy excludes `.git`, `node_modules`, and
`.env*` path segments at every depth. It excludes the exact projection marker
only at the workspace root. It also excludes root `CLAUDE.md` and `GEMINI.md`,
plus direct `.claude/skills/<name>`, `.codex/skills/<name>`, and
`.grok/skills/<name>` paths. These exclusions use paths even for regular files
or copies. A custom policy replaces them, except for exact projection-marker
protection. If you only pass `redact` or `include`, copy
`defaultSandboxSnapshotPolicy()` first or `.env` files are captured. Resolved secrets are redacted before the data is stored. Symlinks,
executables, and special filesystem entries fail the capture or restore. Each
thread has one writer lease. Pause and detach release the lease without a
partial checkpoint. Blob retention is manual because there is no automatic
garbage collection yet.

Read `docs/sandbox/portable-snapshots.md` for the full server-only setup and
the restore safety rules.

For a user-marked workspace state, call `snapshots.save` on the server. Bind
`sandbox` and `instances` at create time, or pass them on `save`. The call
needs `threadId`, `runId`, and a label. It requires a live reusable sandbox.
`reuse: 'none'` cannot save a named checkpoint.

To branch from a selected checkpoint, call `snapshots.fork` with the thread id,
checkpoint id, and destination thread id. The store must implement atomic
`forkFromCheckpoint`. The destination thread must be empty. A fork copies the
selected snapshot, not the latest snapshot.

To send a checkpoint artifact, call `snapshots.readArtifact` on the server.
First authorize the caller for the supplied thread. The method checks that the
checkpoint belongs to that thread, then returns its metadata and bytes. It does
not authorize a caller or create an HTTP response.

For a SQLite checkpoint store, use one transaction for a checkpoint write, its
head update, and every blob reference update. Use one transaction for a fork,
including its copied conversation. A partial transaction breaks snapshot
consistency.

Snapshot capture supports regular files and empty directories only. It excludes
`.git`, `node_modules`, and `.env*` path segments at every depth. It excludes
the exact projection marker only at the workspace root. It also excludes root
`CLAUDE.md` and `GEMINI.md`, plus direct `.claude/skills/<name>`,
`.codex/skills/<name>`, and `.grok/skills/<name>` paths. These exclusions use
paths even for regular files or copies. A custom policy replaces them, except
for exact projection-marker protection. It rejects symlinks, executable files,
and special filesystem entries. Restore verifies the manifest and blobs before
it changes a new private sandbox. It never writes into a live resumed sandbox.

## Providers

- `localProcessSandbox()` — runs on the host (no isolation; dev loop only).
- `dockerSandbox({ image })` — isolated container; snapshots, fork, resume-by-id.
- `daytonaSandbox({ apiKey, snapshot, autoStopInterval, ephemeral })` —
  Daytona cloud sandbox; snapshots after setup; resume starts stopped or
  archived sandboxes. `/workspace` maps to `/home/daytona/workspace`. Setup
  that installs packages must use `sudo -n` (do not deny `sudo *`). See
  `docs/sandbox/providers.md` for network and secret injection details.

All implement the same `SandboxHandle`: `fs` (read/write/list/mkdir/remove/
rename/exists), `git` (clone/status/add/commit/push/pull/branch), `process`
(`exec` + duplex `spawn`), `ports.connect(port)`, `env.set`, optional
`snapshot()`/`fork()`, `destroy()`. Providers advertise support via
`capabilities()`; calling an unsupported optional method throws
`UnsupportedCapabilityError`.

## Policy

```typescript
import { defineSandboxPolicy } from '@tanstack/ai-sandbox'

// Headless Grok Build / Codex: stay on auto-approve. Isolation is the
// outer sandbox (Docker, Daytona, …), not commands.deny on this policy.
const policy = defineSandboxPolicy({
  default: 'allow',
})
// pass to defineSandbox({ policy }); harness adapters map it to native permissions
```

Claude Code can use `default: 'ask'` plus allow/ask/deny lists. Use Claude Code
when you need command-level deny. Provider privilege rules (non-root users,
network block at create) live in `docs/sandbox/providers.md`.

## Lifecycle &amp; resume

`reuse: 'thread'` resumes one sandbox per `threadId`; the compound key folds in
provider + workspace hash + tenant so changing the repo/setup/image starts
fresh. Ensure order: resume running → restore snapshot → create + bootstrap.

## Instance durability (durable resume)

Resume bookkeeping defaults to in-memory (single-process). For cross-process /
multi-replica resume, implement a durable `SandboxInstanceStore` (BYO) and pass
it as `withSandbox(sandbox, { instances })`. Pair multi-replica with a
distributed lock: either `withLocks` from `@tanstack/ai/locks` (ordered
**before** `withSandbox`) or the `locks` option.

```typescript
import { chat } from '@tanstack/ai'
import { InMemoryLockStore, withLocks } from '@tanstack/ai/locks'
import { withSandbox } from '@tanstack/ai-sandbox'
// Production: your BYO store — docs/sandbox/durability.md
import { instanceStore } from './sandbox-instance-store'

chat({
  adapter,
  messages,
  middleware: [
    withLocks(new InMemoryLockStore()), // multi-replica: distributed lock
    withSandbox(sandbox, { instances: instanceStore }),
  ],
})
```

The store option takes precedence over an ambient `SandboxInstanceStoreCapability`
(provided by a platform layer via `provideSandboxInstanceStore`), which in turn
beats the in-memory fallback.

Chat transcript durability (`withPersistence`) is independent — compose both
when the app needs history _and_ instance reuse. Prove adapters with
`runSandboxInstanceStoreConformance` from `@tanstack/ai-sandbox/testkit`.
Use `defineSandboxInstanceStore({ get, upsert, delete })` for inline typing of a
BYO store (same pattern as `defineLock` / `defineMessageStore`).

## File-event hooks

Watch the workspace for create/change/delete events. Provider-agnostic: native
`fs.watch` on local-process, a portable `find` poll on Docker/exec-only
providers (no extra deps or image changes).

Declare hooks on `defineSandbox({ hooks })` (sandbox-scoped) or on any chat
middleware via the `sandbox` group (run-scoped):

```typescript
import { defineSandbox, withSandbox } from '@tanstack/ai-sandbox'
// `defineChatMiddleware` is core's, not this package's — `@tanstack/ai-sandbox`
// consumes it too (see its own `src/middleware.ts`).
import { defineChatMiddleware } from '@tanstack/ai'
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

- **`pipeToRunLog` / `RunController`** (the run driver), built on two of core's
  (`@tanstack/ai`) durable seams: a `RunStore` for the run's lifecycle record
  (the same store `withPersistence` uses for chat history) and a
  `StreamDurability` for its event log (`memoryStream` or `durableStream`).
  `pipeToRunLog(stream, { runs, durability, runId, threadId, signal, logger })`
  pumps a `chat()` stream into both and is **total**: every store/event-log
  call is individually guarded, so it never throws and never rejects. A
  thrown stream error becomes a terminal `RUN_ERROR` event plus the record's
  `error`, so a detached client always observes failures, and a failing store
  write or a failing durability close is recorded through the optional
  `logger` (same `logger?.errors(...)` contract core uses) rather than
  silently absorbed. `threadId` is required. `RunController` wraps a fixed
  `RunDeps = { runs, durability, logger? }`, where **`durability` is a per-run
  factory `(runId) => StreamDurability`, not an instance**:

  ```typescript
  import { InMemoryRunStore, memoryStream } from '@tanstack/ai'
  import { RunController } from '@tanstack/ai-sandbox'
  import type { StreamChunk } from '@tanstack/ai'

  const runs = new InMemoryRunStore()

  export async function driveOne(
    request: Request,
    runId: string,
    threadId: string,
    stream: AsyncIterable<StreamChunk>,
  ): Promise<void> {
    const controller = new RunController({
      runs,
      // A per-run FACTORY. A `StreamDurability` is bound to ONE run, so the log
      // is resolved FROM the runId rather than handed in pre-bound. Whatever you
      // pass MUST return the same instance for the same runId within a process,
      // or `snapshot()` will not see this host's own appends. `memoryStream`
      // keys its log by the run the request names, so every call for one run
      // shares one log; swap in `durableStream(request, options)` in production.
      durability: () => memoryStream(request),
    })

    const handle = controller.start({ runId, threadId, stream })
    // handle.runId, handle.done (resolves with the terminal RunRecord)

    // `attach` takes the runId FIRST, because the log it reads is per-run.
    // fromOffset is an opaque string the durability adapter produced; for
    // memoryStream, '-1' replays from the start. The third `signal` argument is
    // optional and stops tailing when it aborts.
    for await (const { offset, chunk } of controller.attach(runId, '-1')) {
      console.log(offset, chunk.type)
    }

    await handle.done
    await controller.drain() // await every in-flight run, e.g. inside waitUntil
  }
  ```

  Terminal statuses are `'completed' | 'failed' | 'aborted'` (core's
  `TerminalRunStatus`); a run may also be `'running'` or `'interrupted'`
  (`RunStatus`). Because the log is resolved from the `runId`, a
  `RunController` **is** safe for concurrent runs: each run appends to its own
  log and no run's `close()` terminalizes another's. Two failures that a
  single pre-bound instance used to make reachable are now unrepresentable —
  writing the lifecycle record under one id and the events under another, and
  parallel runs interleaving chunks into one log. Do not hand back the same
  `StreamDurability` for every `runId` to "simplify" the factory; that
  reintroduces both.

  For a production takeover, do **not** drive `RunController` /
  `pipeToRunLog` by hand — use `sandboxRunDriver` (see
  [Takeover](#takeover-detached-runs-and-single-writer-safety)), which owns the
  claim, the epoch fence, and the quiescence gate.

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
- `DurableObjectRunEventLog` mirrors `InMemoryRunEventLog` (both live in
  `@tanstack/ai-sandbox-cloudflare`, exported from its `/agent` entry) over DO
  storage; `timingSafeBearerEqualWeb` is the Web-Crypto constant-time bearer
  check. That package's own `RunStatus`, `TerminalRunStatus`, `RunRecord`, and
  `RunError` describe its event-log vocabulary, which is deliberately distinct
  from core's run-lifecycle types of the same names; the `/agent` entry
  re-exports them under a `Legacy` prefix (`LegacyRunStatus`,
  `LegacyTerminalRunStatus`, `LegacyRunRecord`, `LegacyRunError`) so an app can
  import both this package's run driver and the Cloudflare event log without a
  name collision. `RunEventLog`, `RunEvent`, and `RunEventLogReadOptions` have
  no equivalent in core and keep their plain names.

## Durable runs (the run journal)

A harness adapter's agent CLI (Claude Code, Codex, …) writes its NDJSON stdout
into a run journal instead of a pipe the host holds open: a shell redirect
appends every line to `/tmp/tanstack-runs/<runId>.ndjson` inside the sandbox
(stderr goes to a `<runId>.err` sidecar, never mixed in), so the host can
return without holding a live process handle, and a reader replays the same
file from byte 0 at any point, including after the original host has died.

```typescript
import { spawnNdjson } from '@tanstack/ai-sandbox'

for await (const event of spawnNdjson(sandbox, agentCommand, {
  cwd,
  journal: { runId }, // durability is opt-in: pass `journal` to route through it
})) {
  // parsed NDJSON objects, translated by the harness adapter as usual
}
```

**A `runId` MUST be unique per run.** The journal is append-only by design (a
takeover needs the prefix a previous host already wrote to still be there), so
reusing a `runId` appends to the previous run's journal file. A reader stops at
the FIRST `{"__exit":N}` sentinel it encounters, which is the earlier run's, so
the new run appears to emit nothing, or to fail with the previous run's exit
code. Uniqueness is therefore the caller's job and is deliberately not
enforced — refusing to append would break the append-only property a takeover
depends on.

**Absence, unlike reuse, IS enforced.** Every harness adapter routes through
`resolveDurableRunId(options.runId, { durable, adapter, fallback })`, which
throws `DurableRunIdRequiredError` when sandbox durability is wired and no
`runId` was passed — a generated id is never minted for a durable run, not even
one that is discarded, because no successor host could recompute its journal
path. The `fallback()` to a generated id survives only for non-durable runs,
where several `chat()` paths legitimately pass `runId` as a conditional spread.
The journaling adapters are **Claude Code, Codex, and Grok Build**; ACP and
OpenCode do not journal and pass `durable: false`, so they keep the fallback
unconditionally today and inherit the enforcement automatically if either gains
journaling.

### Reading strategy

`readJournal` (and `spawnNdjson`'s journal path, via `readJournalNdjson`)
picks one of two strategies from the sandbox's advertised capabilities, never
from the provider's name:

- **follow** (`tail -f`, started with `handle.process.spawn`), when
  `capabilities.backgroundProcesses && capabilities.killableProcesses` are
  both true. It streams with no polling cost and is stopped by killing the
  `tail` when the consumer stops reading.
- **bounded poll** (repeated bounded `exec` reads, `DEFAULT_JOURNAL_POLL_MS`,
  250ms) otherwise. `killableProcesses` is `false` for a provider like
  Cloudflare, whose `kill()` is a documented no-op and whose Workers RPC
  cannot serialize an `AbortSignal` across the boundary, so a `tail -f`
  started there could never be stopped and the poll path is used instead.

The bounded read (`journalReadCommand`) base64-frames its output, because
`exec` closes the encoder's stdin, which flushes it, so the whole frame
arrives as one complete result. The follow path (`journalFollowCommand`) does
**not** base64-frame its output: `base64` fully buffers its stdout when that
stdout is not a tty, so `tail -f file | base64` would emit nothing until the
libc stdio buffer fills or `tail -f`'s stdin closes, and that stdin never
closes until the reader kills it, at which point the consumer has already
stopped waiting for bytes. Dropping the frame on the follow path is safe
because the journal is line-delimited JSON and every provider already decodes
stdout text on this path the same way it decodes an agent's own stdout.

### Alignment: replaying without duplicating

`alignToStoredLog` reads a run's already-stored event log with
`durability.snapshot()` (a bounded, point-in-time read; never `read()`, which
tails and never resolves against a log a dead producer never closed),
compares each replayed chunk against the stored one by `chunkFingerprint`, and
forwards only the remainder past what is already stored. Downstream, that
remainder is always passed to `append`, never `upsert`: the journal path only
ever appends, because deciding the append point is exactly what alignment
does. A replayed chunk that does not match the stored chunk at the same index
throws `JournalReplayDivergedError` rather than forwarding data that might be
corrupt.

Message ids on the journaled path come from `createRunScopedIdGen(runId)`,
a per-run counter (`<runId>-0`, `<runId>-1`, …) with no clock and no
randomness, wired as harness translators' `genId`, so re-translating the same
journal bytes twice reproduces the same ids. `chunkFingerprint` excludes only
the `timestamp` field (wall-clock, unreproducible) from the comparison;
everything else, including nested tool-call arguments, participates.

**Determinism is translator-level only.** On `ai-claude-code` and `ai-codex`,
`mergeChunkStreams(translated, channel.stream)` splices host-tool-bridge
events from a live tool execution into the middle of the stream; those events
do not occur again on replay. A run that used a bridged tool can still
diverge on replay for that reason: alignment guarantees reproducibility of
the translation step, not of everything that can happen during a run.

### Cleanup

Once a run reaches its `{"__exit":N}` sentinel, both journal files are
deleted. A run that terminates while **detached** (no host reading its
journal) has no reader to observe the sentinel, so nothing deletes its
journal on the run's own path. `pruneJournals` bounds that: it walks the
journal directory, asks the run store about each runId it decodes, deletes
only the journals whose runs are terminal, and keeps everything it cannot
prove dead (non-terminal, undecodable, or too young to be an orphan). It runs
from a cron the application schedules, not from a run, so an abandoned journal
survives until that sweep — this journal, reader, and alignment primitive do
not clean it up themselves.

The journal, the reader, and `alignToStoredLog` are the primitives a takeover is
built from. `sandboxRunDriver` is what drives one — see the next section.

## Takeover: detached runs and single-writer safety

A tab does not last ten minutes; a sandboxed coding agent does. Without
durability wired, `withSandbox`'s abort path destroys the sandbox on **every**
abort, deliberately — closing the agent's IO stream does not kill the agent
process (a Docker `exec` survives its client), so destroying the container is
the only reliable way to stop it burning tokens. Correct for a cancel, ruinous
for a refresh.

### Durability is ONE opt-in, not two

`withSandbox(sandbox, { runs, durability })`. A run is durable only when **both**
are present: a record with no event log cannot be replayed, and a log with no
record cannot be found, claimed, or reaped. There is no half-configured state —
**pass one and you silently get exactly today's behavior, with no warning**,
because you have not asked for durability. This is the single easiest way to
believe you shipped durable runs and have shipped nothing.

Pass the **same** `RunStore` chat persistence uses (`persistence.stores.runs`),
and hand the **same** `StreamDurability` instance to both `withSandbox` and the
transport, so one record and one log describe the run.

```typescript
import { memoryStream, toServerSentEventsResponse } from '@tanstack/ai'
import { withSandbox } from '@tanstack/ai-sandbox'
import type { AnyChatMiddleware, RunStore } from '@tanstack/ai'
import type { SandboxDefinition } from '@tanstack/ai-sandbox'

export function durableSandboxMiddleware(
  request: Request,
  sandbox: SandboxDefinition,
  runs: RunStore,
): { middleware: AnyChatMiddleware; adapter: ReturnType<typeof memoryStream> } {
  // ONE adapter instance, handed to both the middleware and the transport.
  const adapter = memoryStream(request)
  return {
    adapter,
    middleware: withSandbox(sandbox, {
      runs,
      durability: { adapter },
    }),
  }
}
// …then: toServerSentEventsResponse(stream, { durability: { adapter } })
```

`runId` is also **required** for a durable run: `chatStream` throws
`DurableRunIdRequiredError` when none is passed, because the journal path and
the deterministic id generator are both derived from it and a successor host can
only resume a run whose `runId` it can recompute.

### Detach vs cancel — intent NEVER comes from the disconnect

A user pressing Stop and a user closing the tab produce the **identical**
connection close. There is nothing in the disconnect to tell them apart, so
never try. Intent arrives out of band, and there are exactly two bands, either
of which is authoritative:

1. **Durable** — `requestRunCancel(runs, runId)` records `cancelRequested` on
   the run record. This is the only channel that reaches a run being driven by a
   **different** host than the one the cancel landed on, which is the normal
   case for a detached run.
2. **In-process** — abort the run's own `AbortController` with
   `RUN_CANCEL_REASON`. Core reads that reason back into `AbortInfo`, so
   `AbortInfo.cancelRequested` is `true` for that abort and `false` for a plain
   disconnect. Fast path only.

A cancel endpoint should do **both**. `requestRunCancel` deliberately writes no
status: recording intent is not the same as the run having stopped, and only the
driver knows when the agent is dead and the sandbox is gone.

```typescript
import { RUN_CANCEL_REASON, requestRunCancel } from '@tanstack/ai'
import type { RunStore } from '@tanstack/ai'

/** Runs THIS process drives. A run driven by another replica is absent here. */
const driving = new Map<string, AbortController>()

export async function cancelRun(
  runs: RunStore,
  threadId: string,
): Promise<void> {
  const active = await runs.findActiveRun(threadId)
  if (!active) return
  // Band 1: durable, so a remote driver observes it on its next teardown.
  await requestRunCancel(runs, active.runId)
  // Band 2: in-process, so a co-located driver stops immediately.
  driving.get(active.runId)?.abort(RUN_CANCEL_REASON)
}
```

On the client, **`chat.stop()` alone is not a cancel.** It aborts a local
`AbortController` and sends the server nothing, which on a durable run is
indistinguishable from a refresh — so the agent keeps running and keeps
spending tokens with nobody watching. Call a cancel endpoint too.

What each path writes: a disconnect on a durable run with `detachOnDisconnect`
on and no cancel recorded keeps the sandbox and writes `detachedSince` +
`sandboxKey`, while `withPersistence` writes **nothing** (the record stays
`'running'`). A cancel in either band destroys the sandbox regardless of
`destroyOnComplete`, and `withPersistence` writes `'aborted'`. `keepAlive` /
`destroyOnComplete: false` govern _successful completion_ only — they never keep
a sandbox alive through a cancel.

### `sandboxRunDriver` — the supported way to drive a resumed run

Takeover happens in the `GET` handler that already serves resumes. Add a
`driver` and the same request that replays the log also claims the run and keeps
driving it. **Do not hand-roll this.** `sandboxRunDriver` owns the claim, the
epoch fencing, and the quiescence gate; a consumer wiring `pipeToRunLog`
directly is re-implementing exactly the seam that produced this phase's
duplicate-write and false-terminal-write bugs.

```typescript
import { memoryStream, resumeServerSentEventsResponse } from '@tanstack/ai'
import { sandboxRunDriver } from '@tanstack/ai-sandbox'
import type { RunStore, StreamChunk } from '@tanstack/ai'
import type { LockStore } from '@tanstack/ai/locks'

/**
 * The claim hands `drive` an `AbortSignal` that fires the moment this host loses
 * ownership; `chat()` takes an `AbortController`. Mirror one onto the other, or
 * a lost claim never stops the drive.
 */
export function controllerFor(signal: AbortSignal): AbortController {
  const controller = new AbortController()
  const abort = (): void => controller.abort(signal.reason)
  if (signal.aborted) abort()
  else signal.addEventListener('abort', abort, { once: true })
  return controller
}

export function takeoverResponse(
  request: Request,
  runs: RunStore,
  locks: LockStore,
  drive: (input: {
    runId: string
    threadId: string
    signal: AbortSignal
  }) => AsyncIterable<StreamChunk>,
): Response {
  return resumeServerSentEventsResponse({
    adapter: memoryStream(request),
    driver: sandboxRunDriver({
      request,
      runs,
      locks,
      // Per-run factory, same shape as `RunDeps.durability`.
      durability: () => memoryStream(request),
      drive,
      // Serverless: pass `waitUntil: (p) => ctx.waitUntil(p)` to keep the
      // background drive alive. `fenceQuietMs` overrides the quiescence window.
    }),
  })
}
```

Inside `drive`, run `chat()` with `abortController: controllerFor(input.signal)`
and `withSandbox(sandbox, { runs, durability: { adapter, attach: true } })`.
**`attach: true` is the whole difference** — the harness tails the run's
EXISTING journal instead of starting a second agent. It belongs there and never
on `chat()` (core has no sandbox vocabulary), and it is set only by an attach
route, never by a `POST` handler. Load the thread from the message store: the
client sent no history because it is reconnecting, not asking a question — and
pass the run record's `threadId`. Forget it and the attach **refuses up front**
with `DurableThreadIdRequiredError` rather than failing mid-stream: every emitted
chunk carries `threadId`, so a generated one differs from the stored log in its
very first chunk. `resolveDurableThreadId` throws only in the durable-AND-
attaching quadrant — a durable _fresh_ run legitimately mints its `threadId`,
since it is the run that establishes it. `JournalReplayThreadIdMismatchError` is
still what surfaces if a mismatched `threadId` reaches `alignToStoredLog` by some
other route; `sandboxRunDriver` itself forwards `active.threadId` into
`drive({ runId, threadId, signal })`, so the remaining gap is application `drive`
code that does not pass it on to `chat()`.

The response is byte-identical whether or not you pass `driver`: it still
replays from the durability log. The drive runs beside it, appending to the
producer-side log, and the response tails what lands. Everything is total by
construction — no run id, no record, an already-terminal record, another host
holding the claim, or a throwing drive all resolve to "serve the log, drive
nothing", logged server-side.

Branchable failures, all barrel-exported:

```typescript
import {
  RunClaimLostError,
  RunClaimNotAcquiredError,
  RunDriverPipeOutsideClaimError,
} from '@tanstack/ai-sandbox'

export function describeDriveFailure(error: unknown): string {
  if (error instanceof RunClaimNotAcquiredError) {
    // 'terminal' | 'unknown' | 'superseded' — an ordinary contended takeover.
    return `not driving ${error.runId}: ${error.reason}`
  }
  if (error instanceof RunClaimLostError) {
    return `superseded mid-drive at epoch ${error.heldEpoch}`
  }
  if (error instanceof RunDriverPipeOutsideClaimError) {
    // Programming error: the options object was taken apart and `pipe` called
    // outside `claim`, so there is no epoch to fence with.
    return `run ${error.runId}: pipe ran outside its claim`
  }
  throw error
}
```

The first two are normal outcomes of a contended takeover and
`resumeServerSentEventsResponse` already swallows both — expect them in logs,
not in responses.

### Single-writer safety: BOTH seams are fenced

Only one host may write a run. The client has no safety net below its offset
de-dup: if two hosts each snapshot the log, compute a "remainder", and append
it, the same logical chunk lands twice under two different offsets, looks new,
and the stream processor applies text and tool-argument deltas unconditionally
— doubled prose and `{"a":1}{"a":1}` tool arguments. Takeover is by definition
two hosts wanting one run, so the exclusion has to be real. Three layers, all
wired by `sandboxRunDriver`: a per-run **lease** (`LockStore.withLock` around
the whole drive), an **epoch** (`RunRecord.driverEpoch`, bumped by each
successful claim and re-read before appends), and **quiescence** (the successor
waits for the stored log to stop growing before its first append;
`DEFAULT_FENCE_QUIET_MS` = 5s, override with `fenceQuietMs`).

**A run's facts live in two places, and both are fenced.** This is the part a
reader gets half-right and then builds a broken poller on:

- **The event log.** A superseded driver's `append` is **refused**, and the
  first refusal latches the fence permanently shut.
- **The run record.** A **terminal-status `update` from a lost claim is
  suppressed** — it resolves without writing. Non-terminal writes still pass
  through (a stale `detachedSince` / `sandboxKey` cannot make a live run look
  finished, and the successor overwrites them anyway).

Fencing only the log would not remove the harm, it would relocate it:
`pipeToRunLog` answers a refused append by writing a terminal record, so a dead
host would mark the successor's healthy run `'failed'`, and every consumer that
branches on terminal status (`isTerminalRunStatus`, `findActiveRun`, a status
poller, a reaper) would believe a live run died on the authority of a host that
no longer owns it. Because both seams are closed, **a terminal status on the
record is trustworthy and a status poller may believe it.**

`close()` is outside both fences, deliberately: it runs on every teardown path
including the teardown _caused_ by losing the claim, and a fenced `close` would
wedge the record at `'running'` with every live tailer parked forever — a
durability `read` only ends when the log closes.

This is **not** airtight fencing. A predecessor paused (GC, VM suspend) longer
than the quiescence window between its last fence check and its append landing
can still write one batch; closing that needs a compare-and-set
`StreamDurability.append` does not offer. Mitigate at deployment level: a
lease-backed distributed `LockStore`, and `fenceQuietMs` above the lease renewal
interval.

### Replay from zero, and `JournalReplayDivergedError`

A takeover does **not** resume the journal where the dead host stopped. It
re-reads the journal **from byte zero**, re-translates it, and alignment makes
that safe: the stored log is read once with `snapshot()`, the replay is verified
against it by `chunkFingerprint`, the matching prefix is suppressed, and only
the remainder is appended and delivered. The log _is_ the checkpoint, so no
checkpoint can disagree with it.

If the replay produces a different chunk than the log holds at that index,
`JournalReplayDivergedError` is thrown with the index and both fingerprints:

```typescript
import {
  JournalReplayDivergedError,
  JournalReplayThreadIdMismatchError,
} from '@tanstack/ai-sandbox'

export function report(error: unknown): string {
  // Check the subclass FIRST — it separates a config mistake from a real
  // determinism bug in one check.
  if (error instanceof JournalReplayThreadIdMismatchError) {
    return 'the attach route drove the run without the record threadId'
  }
  if (error instanceof JournalReplayDivergedError) {
    return `diverged at ${error.index}: stored ${error.stored}, replayed ${error.replayed}`
  }
  throw error
}
```

Read it plainly: **translation stopped being deterministic.** Realistic causes
are a `genId` that is not run-scoped, a translator that consults the clock, or a
journal that was rewritten (usually a reused `runId`). **Treat it as a bug to
fix, not a condition to recover from.** Do not catch it and continue: the log is
authoritative and already went to the client, so forwarding past a mismatch
delivers a stream whose prefix and suffix disagree about message identity. Log
the index and both fingerprints, let the run fail, and check `runId` uniqueness
first.

One tolerance exists: on adapters that splice host-tool-bridge events into
their output (`@tanstack/ai-claude-code`, `@tanstack/ai-codex`), the log holds
`CUSTOM` chunks fired by _live_ tool execution that a replay runs no tools to
reproduce. Alignment skips those as out-of-band, up to
`DEFAULT_MAX_OUT_OF_BAND_SKIP` (64) consecutive entries. The bound is what keeps
this a tolerance rather than a forward search for any fingerprint that happens
to match.

### A real `LockStore` is required

`InMemoryLockStore` **cannot** coordinate across hosts: it serializes claims
within one process, and the signal it hands out is a fresh
`AbortController().signal` that is never aborted, so the lease can never report
a loss. Two replicas then drive one run and duplicate its log. `withSandbox`
emits a warning when durability is wired over an in-memory lock — **including
when no lock is wired at all**, because `defineSandbox`'s `ensure` falls back to
a process-lifetime `InMemoryLockStore`, which is the most in-memory case, not an
exempt one. Wire a distributed store with `withLocks` from `@tanstack/ai/locks`
(ordered **before** `withSandbox`) or the `locks` option.

Also required: a `RunStore` whose `update` round-trips `status`, `finishedAt`,
`error`, `usage`, `sandboxKey`, `detachedSince`, `cancelRequested`, and
`driverEpoch`. The last four are what a hand-written backend tends to omit, and
each omission breaks one mechanism: no `driverEpoch` → no fencing; no
`cancelRequested` → Stop cannot reach a remote driver; no
`detachedSince`/`sandboxKey` → nothing can reclaim the sandbox. `findActiveRun`
and `listReclaimable` are optional (feature-detect them), but you need the first
to rejoin by thread and the second for `reapDetachedRuns` to have anything to
sweep — a store without it cannot be reaped at all.

### The reaper ships as a function, not a scheduler

`reapDetachedRuns` (with `sandboxReclaimer` for the sandbox teardown and
`pruneJournals` for the journal directory) is what closes out a detached run, but
nothing in the framework calls it: the application must, from its own cron route,
queue consumer, Durable Object `alarm()`, or `waitUntil`. Wiring `durability` and
never scheduling it leaves detached delivery logs open forever — every attached
tailer parks, the TTL is inert, and sandboxes bill indefinitely.

**`hasFinished` is a REQUIRED option, not a nicety.** The sweep must never drive a
run to find out whether it finished: `pipeToRunLog` is total, so it always writes a
terminal status and always calls `close()`, which on a live run means a false
transcript, every tailer's stream ended, and a record that has left
`listReclaimable` forever (so the sandbox can never be reclaimed). So the sentinel
is detected **out of band**, and neither the delivery log (frozen at the last
delivered chunk once the viewer left) nor this package (`SandboxInstanceStore` has
no `list`) can answer it. `probeRunExit` is the shipped implementation; only your
application can map a `sandboxKey` to a live handle for it. Anything it cannot
answer must be `unknown`, never `finished`:

```typescript
import {
  probeRunExit,
  reapDetachedRuns,
  sandboxReclaimer,
} from '@tanstack/ai-sandbox'
import type { RunRecord } from '@tanstack/ai'
import type { ReapResult, RunExitProbe } from '@tanstack/ai-sandbox'

async function hasFinished(record: RunRecord): Promise<RunExitProbe> {
  if (record.sandboxKey === undefined) return { state: 'unknown' }
  try {
    const instance = await instances.get(record.sandboxKey)
    if (instance === null) return { state: 'unknown' }
    const handle = await sandbox.provider.resume({
      id: instance.providerSandboxId,
    })
    if (handle === null) return { state: 'unknown' }
    return await probeRunExit({ handle, runId: record.runId })
  } catch (error) {
    return { state: 'unknown', error }
  }
}

export function sweepDetachedRuns(): Promise<ReapResult> {
  return reapDetachedRuns({
    runs, // the SAME RunStore the chat routes use
    locks, // the same distributed LockStore withSandbox gets
    durability: durabilityFor, // per-run factory resolving the SAME log
    hasFinished,
    drive: driveRun, // the same `drive` the attach route passes sandboxRunDriver
    now: Date.now(),
    detachedRunTtlMs: 30 * 60 * 1000,
    reclaim: sandboxReclaimer({ provider: sandbox.provider, instances }),
  })
}
```

`reapDetachedRuns` resolves rather than rejects; read its `outcomes` tally. Note
that `'producing'`, `'unknown'`, and `'not-claimed'` mean the run was left
untouched, whereas `'budget-exceeded'` is the opposite — the record IS terminal,
the log IS closed, and `reclaim` fired; it flags a run the probe said had finished
that would not replay in time, i.e. a misbehaving journal read, translation, or
log. `'reclaim-failed'` means the transcript saved but the sandbox is still up, and
no later sweep will retry it — the shipped `sandboxReclaimer` **rejects** (with
`SandboxReclaimFailedError`) when the provider's `destroy` throws, which is what
makes that outcome reachable at all, so a custom `reclaim` must reject too rather
than logging and resolving. It overwrites `'budget-exceeded'` when a run hit both;
`ReapRunEntry.terminalizedAnyway` is set if and only if the budget anomaly
happened and is what keeps that second diagnostic on the entry.

**`ReapOptions.detachedRunTtlMs` is the ONLY detached-run TTL.** It is required,
passed directly to `reapDetachedRuns`, and nothing derives it from `withSandbox`
— there is no TTL option on `durability`, and no other config to keep it in sync
with.

Full reaper wiring — every outcome, `pruneJournals`' keep/delete table, and the
scheduling shapes — is in `docs/sandbox/reaping.md`. The attach/takeover half,
including the client `joinRun` side, is in `docs/sandbox/takeover.md`.

## Events

- `claude-code.session-id` (CUSTOM) — resumable session id → pass back via
  `modelOptions.sessionId`.
- `file.changed` (CUSTOM) — `{ path, diff }` working-tree diff after the run.
- `sandbox.file` (CUSTOM) — `{ type, path, timestamp }` per file create/change/
  delete, emitted automatically when a sandbox is active.

## Critical rules

- **Harness adapters require a sandbox.** Always include `withSandbox(...)` in
  `middleware` — without it `chat()` throws a missing-capability error.
- **Secrets** (`workspace.secrets`) are injected into the sandbox env. Their
  raw values are never persisted in snapshots, the sandbox store, or the event
  log. Always create them with `createSecrets(...)` so the values stay hidden
  behind `SecretRef` tokens. The agent binary (`claude`) must exist in the
  sandbox image (install it in `setup` or bake it into the image).
- **Secret-bearing projected files** (e.g. MCP config with resolved header
  values) can be included by default capture. Capture replaces resolved secret
  bytes with zero bytes before it hashes or writes snapshot blobs. Restore runs
  before projection, so projection writes current secret values after restore.
- **chat()-provided `tools` are bridged** into the in-sandbox agent over a
  host-side MCP tool-proxy: the agent calls them as `mcp__tanstack__<tool>` and
  each call is proxied back to the host where the tool's `execute()` runs (with
  its closures / DB / secrets). The agent also has its own native tools
  (Bash/Edit/Read/…). The host bridge binds on the host; the sandbox reaches it
  (localhost, or `host.docker.internal` for Docker), gated by a per-run bearer
  token.
- **Durable runs are one opt-in.** `withSandbox(sandbox, { runs, durability })`
  needs BOTH; pass one and you silently get today's non-durable behavior. Drive
  a resumed run with `sandboxRunDriver`, never by hand-wiring `pipeToRunLog` —
  it owns the claim, the epoch fence (over the log **and** the run record), and
  the quiescence gate. A durable deploy needs a distributed `LockStore`;
  `InMemoryLockStore` (or no lock at all) warns and cannot fence.
- Use `localProcessSandbox()` only in trusted/dev contexts (no isolation).
- Skills/plugins that a CLI lacks (e.g. `agentSkill` on Codex, `plugins` on
  Codex) warn and skip — they do not throw.
