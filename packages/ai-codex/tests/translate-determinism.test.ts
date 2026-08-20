/**
 * Determinism of the codex translator on the journaled path.
 *
 * WHAT THIS COVERS: `translateThreadEvents` mints message ids only through
 * `ctx.genId` (used for `TOOL_CALL_RESULT.messageId`, both the resolved-item
 * path and `synthesizeUnresolvedResults`). Replaying the exact same journal
 * bytes through a fresh `createRunScopedIdGen(runId)` each time must produce
 * an identical chunk sequence (compared via `chunkFingerprint`, which drops
 * only the wall-clock `timestamp` field) — this is the load-bearing property
 * `alignToStoredLog` (a later phase) depends on to recognize what a previous
 * host already delivered and suppress it.
 *
 * WHAT THIS DOES NOT COVER: in the real adapter
 * (`packages/ai-codex/src/adapters/text.ts`), `translateThreadEvents`'s
 * output is not what gets delivered on its own — it is piped through
 * `mergeChunkStreams(translated, channel.stream)`, where `channel.stream`
 * carries CUSTOM events from the host-tool-bridge, produced by *live* tool
 * execution. On a journal replay:
 *   1. No live tools run, so those bridged events do not occur at all.
 *   2. Even for the original run, where they interleave relative to the
 *      translated chunks is timing-dependent, not something recoverable
 *      from the journal.
 * So a deterministic translator (proven here) does NOT imply the adapter's
 * actually-delivered, post-merge stream is deterministic for any run that
 * used bridged tools. This test only exercises `translateThreadEvents` in
 * isolation and intentionally makes no claim about `mergeChunkStreams`
 * output — that gap is left open for Phase 3 to scope, not fixed here.
 */
import { afterAll, describe, expect, it } from 'vitest'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import {
  SandboxCapability,
  chunkFingerprint,
  createRunScopedIdGen,
  journalPaths,
  provideSandboxDurability,
} from '@tanstack/ai-sandbox'
import { InMemoryRunStore } from '@tanstack/ai'
import { codexText } from '../src/index'
import { translateThreadEvents } from '../src/stream/translate'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type {
  CapabilityContext,
  AdapterYieldChunk,
  StreamDurability,
} from '@tanstack/ai'
import type { SandboxHandle } from '@tanstack/ai-sandbox'
import type { CodexThreadEvent } from '../src/stream/sdk-types'

/**
 * Real codex thread-event shapes, copied from `tests/translate.test.ts` and
 * `src/stream/sdk-types.ts` (not invented): a session start, a command
 * execution that starts and completes (exercising the TOOL_CALL_RESULT path
 * that calls `genId()`), an assistant message, and turn completion.
 */
const JOURNAL_EVENTS: Array<CodexThreadEvent> = [
  { type: 'thread.started', thread_id: 'sess-1' },
  { type: 'turn.started' },
  {
    type: 'item.started',
    item: {
      id: 'cmd-1',
      type: 'command_execution',
      command: 'ls',
      status: 'in_progress',
    },
  },
  {
    type: 'item.completed',
    item: {
      id: 'cmd-1',
      type: 'command_execution',
      command: 'ls',
      aggregated_output: 'file.txt\n',
      exit_code: 0,
      status: 'completed',
    },
  },
  {
    type: 'item.completed',
    item: { id: 'item-1', type: 'agent_message', text: 'Done.' },
  },
  {
    type: 'turn.completed',
    usage: { input_tokens: 10, output_tokens: 5 },
  },
]

async function* replay(): AsyncIterable<CodexThreadEvent> {
  for (const event of JOURNAL_EVENTS) {
    // Mirrors the async, one-event-at-a-time delivery a journal reader
    // provides — not a synchronous array iteration.
    await Promise.resolve()
    yield event
  }
}

async function fingerprintRun(genId: () => string): Promise<Array<string>> {
  const out: Array<string> = []
  const chunks: AsyncIterable<AdapterYieldChunk> = translateThreadEvents(replay(), {
    model: 'gpt-5.1-codex',
    runId: 'run-1',
    threadId: 'thread-1',
    genId,
  })
  for await (const chunk of chunks) out.push(chunkFingerprint(chunk))
  return out
}

describe('codex translation determinism (journaled path)', () => {
  it('produces the identical chunk sequence when the same journal is replayed twice', async () => {
    // This is the load-bearing property of journal replay: without it,
    // alignToStoredLog cannot recognize what a previous host already
    // delivered, and a resume would duplicate or corrupt output (see the
    // Phase 2 plan's "Reason 2" for why non-determinism kills the replay
    // mechanism outright).
    const first = await fingerprintRun(createRunScopedIdGen('run-1'))
    const second = await fingerprintRun(createRunScopedIdGen('run-1'))
    expect(first.length).toBeGreaterThan(0)
    expect(second).toEqual(first)
  })

  it('diverges when genId is NOT run-scoped, proving the test has teeth', async () => {
    const randomGenId = (): string =>
      `${Math.random().toString(36)}-${Date.now()}`
    const first = await fingerprintRun(randomGenId)
    const second = await fingerprintRun(randomGenId)
    expect(first).not.toEqual(second)
  })
})

// --- Wiring check: the actual adapter call site (not just the translator) ---
//
// The two tests above exercise `translateThreadEvents` directly with a
// generator we construct ourselves, so they cannot catch a regression at the
// `chatStreamNdjson`/`chatStream` call site in `../src/adapters/text.ts`
// (e.g. reverting `genId: createRunScopedIdGen(runId)` back to
// `genId: () => this.generateId()`). This block runs the real adapter, via
// the same `localProcessSandbox` harness `text-adapter.test.ts` uses, and
// asserts:
//   1. message ids follow the `${runId}-N` shape `createRunScopedIdGen`
//      produces — a shape `this.generateId()`
//      (`${name}-${Date.now()}-${random}`) never produces, and
//   2. the sandbox journal file for this `runId` actually exists after the
//      run, proving `spawnNdjson` really was called with `journal: { runId }`
//      (not just that the adapter happened to mint run-scoped ids some other
//      way).

const baseDir = path.join(
  os.tmpdir(),
  `tanstack-ai-codex-determinism-test-${Date.now()}`,
)
const provider = localProcessSandbox({ baseDir, removeOnDestroy: true })

afterAll(async () => {
  try {
    await fsp.rm(baseDir, { recursive: true, force: true })
  } catch {
    // Windows can report EBUSY here when a child process handle briefly
    // outlives `sbx.destroy()`; this is a cleanup nicety, not part of what
    // the test verifies, so a failure here must not fail the suite.
  }
})

// Stand-in for `codex exec --experimental-json` that additionally emits a
// `command_execution` item start+completion — the shape that exercises
// `genId()` via the TOOL_CALL_RESULT path in `translateThreadEvents`
// (see `handleItemCompleted`'s `isToolItem` branch).
const NATIVE_FAKE_CODEX = [
  `import { writeFileSync } from 'node:fs'`,
  `const w = (o) => process.stdout.write(JSON.stringify(o) + '\\n')`,
  `w({ type: 'thread.started', thread_id: 'sess-1' })`,
  `w({ type: 'turn.started' })`,
  `w({ type: 'item.started', item: { id: 'cmd-1', type: 'command_execution', command: 'ls', status: 'in_progress' } })`,
  `w({ type: 'item.completed', item: { id: 'cmd-1', type: 'command_execution', command: 'ls', aggregated_output: 'file.txt\\n', exit_code: 0, status: 'completed' } })`,
  `w({ type: 'item.completed', item: { id: 'item-1', type: 'agent_message', text: 'pong' } })`,
  `w({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } })`,
].join('\n')

const noopLogger = {
  request: () => {},
  provider: () => {},
  errors: () => {},
  agentLoop: () => {},
  warnings: () => {},
  debug: () => {},
} as unknown as InternalLogger

/**
 * Minimal in-memory `StreamDurability`, just enough to make the sandbox
 * durability capability resolvable (`runs` + `durability.adapter` both
 * present) so this test can exercise the JOURNALED path. Phase 3 gates
 * journaling on that capability rather than on `runId` alone — see
 * `resolveDurableRunId` / `journalOptionsFor` in `@tanstack/ai-sandbox`'s
 * `durability.ts` — so a durability-less capability context (as this file
 * wired before Phase 3) no longer journals at all, and this test would
 * otherwise assert a run that never touches the journal.
 */
function fakeStreamDurability(): StreamDurability {
  return {
    resumeFrom: () => null,
    append: (chunks) => Promise.resolve(chunks.map((_, i) => String(i))),
    read: () => (async function* () {})(),
    close: () => Promise.resolve(),
    snapshot: () => Promise.resolve([]),
  }
}

function capabilityContextWith(handle: SandboxHandle): CapabilityContext {
  const [, provideSandbox] = SandboxCapability
  const ctx = {
    capabilities: { markProvided: () => {}, has: () => true },
  } as unknown as CapabilityContext
  provideSandbox(ctx, handle)
  // Phase 3: journaling requires the resolved sandbox-durability capability,
  // not merely a caller-supplied `runId`. Wire it directly (rather than via
  // `withSandbox`'s `resolveSandboxDurability`, which is intentionally not
  // exported outside the package) so this wiring test still exercises the
  // journaled call site.
  provideSandboxDurability(ctx, {
    runs: new InMemoryRunStore(),
    adapter: fakeStreamDurability(),
    journalDir: '/tmp/tanstack-runs',
    attach: false,
    detachOnDisconnect: true,
  })
  return ctx
}

// `@tanstack/ai-sandbox`'s journal reader picks a "follow" strategy
// (`tail -c +N -f journal | base64`, piped through a spawned `SpawnHandle`)
// whenever `capabilities.backgroundProcesses && capabilities.killableProcesses`
// — true for `local-process`. On this host that pipeline's downstream
// `base64` fully buffers its stdout (it isn't a tty and `tail -f` never
// closes its input), so nothing is ever flushed to the reader for a payload
// under one buffer's worth — the read hangs forever even though the journal
// file itself is complete and correct. This is independent of anything under
// test here (confirmed by reproducing the same hang against the plain
// `spawnNdjson` primitive and against the already-merged
// `ai-grok-build/tests/translate-determinism.test.ts` reference test). The
// bounded "poll" strategy (`tail -c +N journal | base64`, no `-f`) has no such
// problem: each poll is a one-shot process that flushes its buffer on exit.
// `journalReadStrategy` decides purely from `handle.capabilities`, so
// reporting `killableProcesses: false` on the handle we hand the adapter
// steers it onto the poll path without touching `@tanstack/ai-sandbox` or
// the adapter itself — every other operation (fs, process.exec, destroy)
// still goes through the real local-process sandbox unchanged.
/**
 * Force the bounded-poll read strategy, and record every command the adapter
 * spawns so the journal wiring can be asserted from the command itself.
 *
 * Recording the command is the only durable way to prove `journal: { runId }`
 * reached `spawnNdjson`: the journal is deleted once the run reaches its
 * `{"__exit":N}` sentinel, so by the time this test can look, a correctly
 * journaled run and an unjournaled one both leave no file behind.
 */
function pollStrategyHandle(handle: SandboxHandle): {
  handle: SandboxHandle
  spawned: Array<string>
} {
  const spawned: Array<string> = []
  return {
    spawned,
    handle: {
      ...handle,
      capabilities: { ...handle.capabilities, killableProcesses: false },
      process: {
        ...handle.process,
        spawn: (command, options) => {
          spawned.push(command)
          return handle.process.spawn(command, options)
        },
        exec: (command, options) => {
          spawned.push(command)
          return handle.process.exec(command, options)
        },
      },
    },
  }
}

async function collect(
  stream: AsyncIterable<AdapterYieldChunk>,
): Promise<Array<AdapterYieldChunk>> {
  const out: Array<AdapterYieldChunk> = []
  for await (const chunk of stream) out.push(chunk)
  return out
}

describe('codex chatStream wiring (real adapter, journaled call site)', () => {
  it('mints run-scoped message ids and actually journals under the supplied runId', async () => {
    const sbx = await provider.create({})
    await sbx.fs.write('/workspace/fake-codex.mjs', NATIVE_FAKE_CODEX)
    const recorder = pollStrategyHandle(sbx)

    // Unique per test run: `journalPaths`'s default directory
    // (`/tmp/tanstack-runs`) is a REAL host path shared across every
    // `local-process` sandbox instance and every test run (unlike the rest of
    // the sandbox filesystem, it is not virtualized under this test's own
    // `baseDir`/`afterAll` cleanup), and the journal file itself is opened
    // `>>` (append-only) by design — see `journaledCommand` in
    // `@tanstack/ai-sandbox`'s `journal.ts`. A fixed literal `runId` would
    // collide with a previous run's leftover journal file (this file
    // survives this test's own `afterAll`) and the read would stop at
    // that STALE run's `__exit` sentinel, silently observing 0 of this run's
    // events. A fresh id per invocation avoids the collision.
    const runId = `run-wiring-check-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const adapter = codexText('gpt-5.5-codex', {
      codexExecutable: 'node fake-codex.mjs',
    })

    const chunks = await collect(
      adapter.chatStream({
        model: 'gpt-5.5-codex',
        messages: [{ role: 'user', content: 'say pong' }],
        logger: noopLogger,
        runId,
        capabilities: capabilityContextWith(recorder.handle),
      }),
    )

    // Only `TOOL_CALL_RESULT.messageId` comes from `genId()` — the
    // `agent_message`/text chunks above carry the codex-native item id
    // instead (see `handleItemCompleted` in `../src/stream/translate.ts`), so
    // asserting run-scoping across every chunk with a `messageId` field would
    // wrongly fail on those. `command_execution` in `NATIVE_FAKE_CODEX` is
    // exactly what exercises the `genId()`-backed path.
    const toolResultMessageIds = chunks
      .filter((c) => c.type === 'TOOL_CALL_RESULT')
      .map((c) => (c as { messageId?: unknown }).messageId)
      .filter((id): id is string => typeof id === 'string')

    expect(toolResultMessageIds.length).toBeGreaterThan(0)
    for (const id of toolResultMessageIds) {
      expect(id).toMatch(new RegExp(`^${runId}-\\d+$`))
    }

    // Prove `spawnNdjson` was actually invoked with `journal: { runId }`, not
    // merely that the translator happened to receive a run-scoped generator.
    //
    // Asserted against the spawned COMMAND rather than the journal file: the
    // journal is deleted once the run reaches its `{"__exit":N}` sentinel, so a
    // post-run existence check cannot distinguish a journaled run from an
    // unjournaled one. The command is unambiguous, and it is also the thing a
    // regression would actually change.
    const paths = journalPaths(runId)
    const journaled = recorder.spawned.filter((command) =>
      command.includes(paths.journal),
    )
    expect(journaled.length).toBeGreaterThan(0)
    // The agent's own output is redirected into the journal, and the reader
    // reads that same path back.
    expect(journaled.some((command) => command.includes('>>'))).toBe(true)

    // The journal is cleaned up by the reader on the terminal sentinel, so
    // nothing is left for this test to remove.
    await sbx.destroy()
  })
})
