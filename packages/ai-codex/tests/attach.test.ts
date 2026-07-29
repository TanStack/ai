/**
 * Wiring tests for the durable-run attach path (Phase 3).
 *
 * These are wiring tests, not unit tests of `journalOptionsFor` /
 * `alignedIfAttaching` themselves (covered in `@tanstack/ai-sandbox`'s own
 * `durability.test.ts`). What is asserted here is that the REAL adapter call
 * site in `../src/adapters/text.ts` actually reaches those helpers:
 *
 * - journaling is gated on the resolved sandbox-durability capability, not
 *   merely on a caller-supplied `runId` (Task 5);
 * - `attach: true` makes `spawnNdjson` tail the EXISTING journal instead of
 *   starting a new agent (Task 7);
 * - the journal path is derived from the caller-supplied `runId` (Task 5/7);
 * - a durable run with no caller-supplied `runId` fails loudly instead of
 *   silently minting an unrecoverable one (Task 5).
 *
 * Every `runId` and `journalDir` below is minted per test. `journalPaths`'s
 * default directory is a REAL host path (`/tmp/tanstack-runs`) that outlives
 * any single sandbox or test run — see `journal.ts`'s own warning — so a
 * fixed literal here would read a previous run's leftover journal.
 */
import { afterAll, describe, expect, it } from 'vitest'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import {
  DurableRunIdRequiredError,
  DurableThreadIdRequiredError,
  SandboxCapability,
  journalPaths,
  journaledCommand,
  provideSandboxDurability,
} from '@tanstack/ai-sandbox'
import { EventType, InMemoryRunStore } from '@tanstack/ai'
import { codexText } from '../src/index'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type {
  CapabilityContext,
  StreamChunk,
  StreamDurability,
} from '@tanstack/ai'
import type { SandboxHandle, SandboxRunDurability } from '@tanstack/ai-sandbox'

const baseDir = path.join(
  os.tmpdir(),
  `tanstack-ai-codex-attach-test-${Date.now()}`,
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

const noopLogger = {
  request: () => {},
  provider: () => {},
  errors: () => {},
  agentLoop: () => {},
  warnings: () => {},
  debug: () => {},
} as unknown as InternalLogger

// Stand-in for `codex exec --experimental-json`: reads the prompt from stdin
// and emits canned thread-event JSONL, same shape `text-adapter.test.ts` uses.
const FAKE_CODEX = [
  `let input = ''`,
  `process.stdin.on('data', (d) => { input += d })`,
  `process.stdin.on('end', () => {`,
  `  const w = (o) => process.stdout.write(JSON.stringify(o) + '\\n')`,
  `  w({ type: 'thread.started', thread_id: 'th-1' })`,
  `  w({ type: 'turn.started' })`,
  `  w({ type: 'item.completed', item: { id: 'i1', type: 'agent_message', text: 'pong' } })`,
  `  w({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } })`,
  `})`,
].join('\n')

/**
 * Minimal in-memory `StreamDurability`. Only used to make the durability
 * capability RESOLVABLE (`runs` + `durability.adapter` both present) — the
 * journal itself (what `attach: true` actually tails) is a separate,
 * in-sandbox file governed by `SandboxDurabilityOptions.journal`, not this
 * adapter.
 *
 * `seed` pre-populates `snapshot()`, which is what `alignedIfAttaching` reads
 * to decide what a previous host already delivered (see `align.ts`'s
 * `alignToStoredLog`). Defaults to empty, i.e. nothing to align against.
 */
function fakeStreamDurability(
  seed: Array<{ offset: string; chunk: StreamChunk }> = [],
): StreamDurability {
  return {
    resumeFrom: () => null,
    append: (chunks) => Promise.resolve(chunks.map((_, i) => String(i))),
    read: () => (async function* () {})(),
    close: () => Promise.resolve(),
    snapshot: () => Promise.resolve(seed),
  }
}

/**
 * Records every command the handle spawns/execs, and forces the
 * bounded-poll journal read strategy. Mirrors
 * `translate-determinism.test.ts`'s `pollStrategyHandle`: on this host the
 * follow strategy's `tail -f` pipeline can go undelivered for a payload
 * under one stdio buffer, which is a property of this host's stdio, not of
 * anything under test here.
 */
function recordingHandle(handle: SandboxHandle): {
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

function capabilityContext(
  handle: SandboxHandle,
  durability?: SandboxRunDurability,
): CapabilityContext {
  const [, provideSandbox] = SandboxCapability
  const ctx = {
    capabilities: { markProvided: () => {}, has: () => true },
  } as unknown as CapabilityContext
  provideSandbox(ctx, handle)
  if (durability !== undefined) provideSandboxDurability(ctx, durability)
  return ctx
}

function durabilityWith(
  overrides: Partial<SandboxRunDurability> = {},
): SandboxRunDurability {
  return {
    runs: new InMemoryRunStore(),
    adapter: fakeStreamDurability(),
    journalDir: `/tmp/tanstack-runs-attach-${crypto.randomUUID()}`,
    attach: false,
    detachOnDisconnect: true,
    detachedRunTtlMs: 30 * 60_000,
    ...overrides,
  }
}

async function collect(
  stream: AsyncIterable<StreamChunk>,
): Promise<Array<StreamChunk>> {
  const out: Array<StreamChunk> = []
  for await (const chunk of stream) out.push(chunk)
  return out
}

/**
 * The DISTINCT `threadId`s stamped across a run's chunks.
 *
 * A set, not a list, because `threadId` appears on several chunk types
 * (`RUN_STARTED`, `RUN_FINISHED`, …) and what matters is that they all agree on
 * one id — the caller's on an attach, a generated one otherwise. Anything with
 * more than one entry means the resolution ran twice.
 */
function threadIdsOf(chunks: Array<StreamChunk>): Array<string> {
  const seen = new Set<string>()
  for (const chunk of chunks) {
    const value = (chunk as { threadId?: unknown }).threadId
    if (typeof value === 'string') seen.add(value)
  }
  return [...seen]
}

function textOf(chunks: Array<StreamChunk>): string {
  return chunks
    .filter((c) => c.type === 'TEXT_MESSAGE_CONTENT')
    .map((c) => (c as { delta?: string }).delta ?? '')
    .join('')
}

describe('codex attach wiring', () => {
  it('does NOT start an agent when attaching — it only tails the journal', async () => {
    const sbx = await provider.create({})
    const recorder = recordingHandle(sbx)
    const runId = `r-attach-${crypto.randomUUID()}`
    const durability = durabilityWith({ attach: true })
    const paths = journalPaths(runId, durability.journalDir)

    // Pre-populate the journal exactly as a previous host's journaled agent
    // would have — through the shell (`journaledCommand`), not
    // `sandbox.fs.write`: `journal.ts` rule 3 warns the journal directory is
    // a REAL host path outside the virtualized sandbox root, so the two
    // resolve differently. `journaledCommand` also appends the `__exit`
    // sentinel, exactly like a completed prior run's journal would carry.
    const priorEvents = [
      '{"type":"thread.started","thread_id":"sess-1"}',
      '{"type":"turn.started"}',
      '{"type":"item.completed","item":{"id":"i1","type":"agent_message","text":"pong"}}',
      '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}',
    ].join('\\n')
    const seed = await sbx.process.spawn(
      journaledCommand(`printf '${priorEvents}\\n'`, paths),
    )
    expect(await seed.wait()).toBe(0)

    // No `codexExecutable` override, and no fake codex script written at all:
    // if attach were broken and this spawned a NEW agent anyway, it would try
    // to run the real (uninstalled) `codex` binary and the run would fail
    // loudly with a RUN_ERROR (or a rejected read), rather than this test
    // silently passing regardless.
    const adapter = codexText('gpt-5.5-codex')
    const chunks = await collect(
      adapter.chatStream({
        model: 'gpt-5.5-codex',
        messages: [{ role: 'user', content: 'say pong' }],
        logger: noopLogger,
        runId,
        // A real attach always has the run record's `threadId` — core's
        // `startRunDriver` hands it to `drive({ runId, threadId, signal })` —
        // and `resolveDurableThreadId` now REQUIRES it, because an attach that
        // mints a fresh one stamps every chunk with an id the stored log cannot
        // match. Omitting it here (as this test originally did) exercised a
        // configuration that could never align; supplying it keeps the subject
        // of this test — that no agent is spawned on attach — unchanged.
        threadId: `t-attach-${crypto.randomUUID()}`,
        capabilities: capabilityContext(recorder.handle, durability),
      }),
    )

    expect(textOf(chunks)).toContain('pong')
    expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)
    // The command codex's `buildCommand` produces always contains this exact
    // flag; its absence from every spawned/exec'd command proves the agent
    // itself was never started.
    expect(
      recorder.spawned.some((command) =>
        command.includes('exec --experimental-json'),
      ),
    ).toBe(false)
    await sbx.destroy()
  })

  it("aligns against the durability adapter's stored log when attaching, suppressing the already-delivered prefix", async () => {
    // Distinct from the previous test: that one proves the in-sandbox JOURNAL
    // is tailed instead of respawned. This one proves the SEPARATE
    // cross-host durability log (`SandboxDurabilityOptions.adapter`, what
    // `alignedIfAttaching` reads via `snapshot()`) is actually consulted —
    // the two are different logs by design (see `durability.ts`'s module
    // doc), and it is easy to wire one without the other.
    const sbx = await provider.create({})
    const runId = `r-align-${crypto.randomUUID()}`
    const threadId = `t-align-${crypto.randomUUID()}`

    // The stored "already delivered" prefix is exactly the RUN_STARTED chunk
    // `translateThreadEvents` emits first (see `translate.ts`'s `startRun`).
    // `chunkFingerprint` (what `alignToStoredLog` compares with) drops
    // `timestamp`, so an arbitrary placeholder there still matches.
    const storedRunStarted: StreamChunk = {
      type: EventType.RUN_STARTED,
      runId,
      threadId,
      model: 'gpt-5.5-codex',
      timestamp: 0,
    }
    const durability = durabilityWith({
      attach: true,
      adapter: fakeStreamDurability([
        { offset: 'o0', chunk: storedRunStarted },
      ]),
    })
    const paths = journalPaths(runId, durability.journalDir)
    const recorder = recordingHandle(sbx)

    const priorEvents = [
      '{"type":"thread.started","thread_id":"sess-1"}',
      '{"type":"turn.started"}',
      '{"type":"item.completed","item":{"id":"i1","type":"agent_message","text":"pong"}}',
      '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}',
    ].join('\\n')
    const seed = await sbx.process.spawn(
      journaledCommand(`printf '${priorEvents}\\n'`, paths),
    )
    expect(await seed.wait()).toBe(0)

    const adapter = codexText('gpt-5.5-codex')
    const chunks = await collect(
      adapter.chatStream({
        model: 'gpt-5.5-codex',
        messages: [{ role: 'user', content: 'say pong' }],
        logger: noopLogger,
        runId,
        threadId,
        capabilities: capabilityContext(recorder.handle, durability),
      }),
    )

    // The RUN_STARTED chunk was already "delivered" per the stored log, so
    // alignment must suppress it — if `alignedIfAttaching` were bypassed, the
    // freshly-translated RUN_STARTED would come through unsuppressed and this
    // would fail.
    expect(chunks.some((c) => c.type === 'RUN_STARTED')).toBe(false)
    // Everything after the aligned prefix must still arrive.
    expect(textOf(chunks)).toContain('pong')
    expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)
    await sbx.destroy()
  })

  it('starts the agent and tails when NOT attaching', async () => {
    const sbx = await provider.create({})
    await sbx.fs.write('/workspace/fake-codex.mjs', FAKE_CODEX)
    const recorder = recordingHandle(sbx)
    const runId = `r-fresh-${crypto.randomUUID()}`
    const durability = durabilityWith({ attach: false })
    const paths = journalPaths(runId, durability.journalDir)

    const adapter = codexText('gpt-5.5-codex', {
      codexExecutable: 'node fake-codex.mjs',
    })
    const chunks = await collect(
      adapter.chatStream({
        model: 'gpt-5.5-codex',
        messages: [{ role: 'user', content: 'say pong' }],
        logger: noopLogger,
        runId,
        capabilities: capabilityContext(recorder.handle, durability),
      }),
    )

    expect(textOf(chunks)).toContain('pong')
    expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)
    // The agent's stdout was redirected into the journal (`>>`), not piped
    // directly — proving `journal` reached `spawnNdjson` for a FRESH run too,
    // not only on attach.
    const journaled = recorder.spawned.filter((command) =>
      command.includes(paths.journal),
    )
    expect(journaled.length).toBeGreaterThan(0)
    expect(journaled.some((command) => command.includes('>>'))).toBe(true)
    await sbx.destroy()
  })

  it('does NOT journal a non-durable run — byte-identical to a pre-durability run', async () => {
    // The other side of the byte-identical guarantee `journalOptionsFor`
    // documents: a run with no `SandboxDurabilityCapability` wired (no
    // `runs`/`durability.adapter` given to `withSandbox`) must take
    // `spawnNdjson`'s ORIGINAL unjournaled path — piping the agent's stdout
    // directly rather than redirecting it into a file. A caller-supplied
    // `runId` alone must not be enough to turn journaling on; only the
    // resolved durability capability may.
    const sbx = await provider.create({})
    await sbx.fs.write('/workspace/fake-codex.mjs', FAKE_CODEX)
    const recorder = recordingHandle(sbx)
    const runId = `r-nondurable-${crypto.randomUUID()}`
    const paths = journalPaths(runId)

    const adapter = codexText('gpt-5.5-codex', {
      codexExecutable: 'node fake-codex.mjs',
    })
    const chunks = await collect(
      adapter.chatStream({
        model: 'gpt-5.5-codex',
        messages: [{ role: 'user', content: 'say pong' }],
        logger: noopLogger,
        runId,
        // No durability capability provided at all — only the sandbox.
        capabilities: capabilityContext(recorder.handle),
      }),
    )

    expect(textOf(chunks)).toContain('pong')
    expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)
    expect(
      recorder.spawned.some((command) => command.includes(paths.journal)),
    ).toBe(false)
    await sbx.destroy()
  })

  it('derives the journal path from the caller-supplied runId', async () => {
    const sbx = await provider.create({})
    await sbx.fs.write('/workspace/fake-codex.mjs', FAKE_CODEX)
    const recorder = recordingHandle(sbx)
    const runId = `r-derive-${crypto.randomUUID()}`
    const otherRunId = `r-other-${crypto.randomUUID()}`
    const durability = durabilityWith({ attach: false })
    const paths = journalPaths(runId, durability.journalDir)
    const otherPaths = journalPaths(otherRunId, durability.journalDir)

    const adapter = codexText('gpt-5.5-codex', {
      codexExecutable: 'node fake-codex.mjs',
    })
    await collect(
      adapter.chatStream({
        model: 'gpt-5.5-codex',
        messages: [{ role: 'user', content: 'say pong' }],
        logger: noopLogger,
        runId,
        capabilities: capabilityContext(recorder.handle, durability),
      }),
    )

    expect(
      recorder.spawned.some((command) => command.includes(paths.journal)),
    ).toBe(true)
    // Not just "a" journal path — THIS run's, derived from THIS runId, and no
    // other run's path leaks in.
    expect(
      recorder.spawned.some((command) => command.includes(otherPaths.journal)),
    ).toBe(false)
    await sbx.destroy()
  })

  it('reuses the resolved runId for the stdin-fallback prompt file, not a re-derived one', async () => {
    // The plan's own known omission for this package: the stdin-fallback
    // branch (`sandbox.capabilities.writableStdin === false`) used to compute
    // its prompt-file suffix from a SECOND, independent
    // `options.runId ?? this.generateId()`, rather than the runId already
    // resolved via `resolveDurableRunId` above it. When `options.runId` is
    // absent, `this.generateId()` mints a fresh random id on EVERY call, so
    // the two would silently diverge — invisible here (the prompt still gets
    // read from the file it names), but defeating the point of a stable,
    // caller-supplied `runId` for anything keyed off it. This test does not
    // supply a `runId` at all, so a reintroduced bug is observable: the
    // prompt-file suffix would stop matching the id the deterministic
    // `createRunScopedIdGen(runId)` generator actually used.
    //
    // Uses a fully synthetic handle rather than `localProcessSandbox`: that
    // provider's `fs.write` resolves an absolute path under the VIRTUALIZED
    // sandbox root (`handle.ts`'s `resolve()`), while a shell redirect like
    // `< /tmp/...` in a spawned command hits the REAL host `/tmp` — the same
    // fs-vs-shell split `journal.ts` warns about for the journal path. That
    // split is orthogonal to what this test checks (which `runId` gets used,
    // not whether the file round-trips through a real sandbox), so a fake
    // handle sidesteps it entirely instead of exercising an unrelated,
    // pre-existing local-process limitation.
    const spawned: Array<string> = []
    const events = [
      { type: 'thread.started', thread_id: 'th-1' },
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
      { type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } },
    ]
    const fakeHandle = {
      id: 'fake',
      provider: 'fake',
      capabilities: {
        fs: true,
        exec: true,
        env: false,
        ports: false,
        backgroundProcesses: true,
        writableStdin: false,
        killableProcesses: true,
        snapshots: false,
        networkPolicy: false,
        durableFilesystem: false,
        fork: false,
      },
      fs: {
        read: () => Promise.resolve(''),
        readBytes: () => Promise.resolve(new Uint8Array()),
        write: () => Promise.resolve(),
        list: () => Promise.resolve([]),
        mkdir: () => Promise.resolve(),
        remove: () => Promise.resolve(),
        rename: () => Promise.resolve(),
        exists: () => Promise.resolve(false),
      },
      git: {},
      process: {
        exec: () => Promise.reject(new Error('exec unused by this path')),
        spawn: (command: string) => {
          spawned.push(command)
          return Promise.resolve({
            pid: 1,
            stdout: (async function* () {
              for (const event of events) yield `${JSON.stringify(event)}\n`
            })(),
            stderr: (async function* () {})(),
            stdin: {
              write: () => Promise.resolve(),
              end: () => Promise.resolve(),
            },
            wait: () => Promise.resolve(0),
            kill: () => Promise.resolve(),
          })
        },
      },
      ports: {},
      env: {},
      destroy: () => Promise.resolve(),
    } as unknown as SandboxHandle

    const adapter = codexText('gpt-5.5-codex')
    const chunks = await collect(
      adapter.chatStream({
        model: 'gpt-5.5-codex',
        messages: [{ role: 'user', content: 'say pong' }],
        logger: noopLogger,
        // No runId: exercises the generated-fallback path this test targets.
        capabilities: capabilityContext(fakeHandle),
      }),
    )

    const toolResult = chunks.find((c) => c.type === 'TOOL_CALL_RESULT') as
      | { messageId?: unknown }
      | undefined
    const messageId = toolResult?.messageId
    expect(typeof messageId).toBe('string')
    if (typeof messageId !== 'string') {
      throw new Error('unreachable: asserted above')
    }
    // `createRunScopedIdGen(runId)` mints `${runId}-${counter}`; strip the
    // counter to recover the runId the adapter actually resolved.
    const resolvedRunId = messageId.replace(/-\d+$/, '')

    const promptCommand = spawned.find((command) =>
      command.includes('tanstack-codex-prompt-'),
    )
    expect(promptCommand).toBeDefined()
    expect(promptCommand).toContain(
      `/tmp/tanstack-codex-prompt-${resolvedRunId}`,
    )
  })

  it('throws DurableRunIdRequiredError when durability is wired without a runId', async () => {
    const durability = durabilityWith()
    const ctx = {
      capabilities: { markProvided: () => {}, has: () => true },
    } as unknown as CapabilityContext
    provideSandboxDurability(ctx, durability)

    // No SandboxCapability needed: `resolveDurableRunId` throws before the
    // adapter ever reaches `sandboxFrom(options)`, which is exactly the
    // point — a durable run with no caller-supplied `runId` must fail before
    // it spends a single token or touches a sandbox at all.
    const adapter = codexText('gpt-5.5-codex')
    await expect(
      collect(
        adapter.chatStream({
          model: 'gpt-5.5-codex',
          messages: [{ role: 'user', content: 'hi' }],
          logger: noopLogger,
          capabilities: ctx,
        }),
      ),
    ).rejects.toThrow(DurableRunIdRequiredError)
  })

  it('throws DurableThreadIdRequiredError when ATTACHING without a threadId', async () => {
    // The silent-divergence hole this closes: `threadId` lands in every
    // emitted chunk, so an attach that mints a fresh one replays a stream the
    // stored log cannot match at index 0. Before this guard the run started,
    // read the journal, and only then failed alignment mid-stream.
    const runId = `r-no-thread-${crypto.randomUUID()}`
    const durability = durabilityWith({ attach: true })
    const ctx = {
      capabilities: { markProvided: () => {}, has: () => true },
    } as unknown as CapabilityContext
    provideSandboxDurability(ctx, durability)

    // `runId` IS supplied, so `resolveDurableRunId` passes and the rejection
    // can only come from the threadId guard. As with that guard, no
    // SandboxCapability is needed: the refusal precedes `sandboxFrom`.
    const adapter = codexText('gpt-5.5-codex')
    await expect(
      collect(
        adapter.chatStream({
          model: 'gpt-5.5-codex',
          messages: [{ role: 'user', content: 'hi' }],
          logger: noopLogger,
          runId,
          capabilities: ctx,
        }),
      ),
    ).rejects.toThrow(DurableThreadIdRequiredError)
  })

  it('carries a caller-supplied threadId into the chunks when ATTACHING', async () => {
    const sbx = await provider.create({})
    const recorder = recordingHandle(sbx)
    const runId = `r-thread-ok-${crypto.randomUUID()}`
    const threadId = `t-reused-${crypto.randomUUID()}`
    // Empty stored log, unlike the alignment test above: nothing is suppressed,
    // so the RUN_STARTED chunk that carries `threadId` is observable.
    const durability = durabilityWith({ attach: true })
    const paths = journalPaths(runId, durability.journalDir)

    const priorEvents = [
      '{"type":"thread.started","thread_id":"sess-1"}',
      '{"type":"turn.started"}',
      '{"type":"item.completed","item":{"id":"i1","type":"agent_message","text":"pong"}}',
      '{"type":"turn.completed","usage":{"input_tokens":1,"output_tokens":1}}',
    ].join('\\n')
    const seed = await sbx.process.spawn(
      journaledCommand(`printf '${priorEvents}\\n'`, paths),
    )
    expect(await seed.wait()).toBe(0)

    const adapter = codexText('gpt-5.5-codex')
    const chunks = await collect(
      adapter.chatStream({
        model: 'gpt-5.5-codex',
        messages: [{ role: 'user', content: 'say pong' }],
        logger: noopLogger,
        runId,
        threadId,
        capabilities: capabilityContext(recorder.handle, durability),
      }),
    )

    expect(textOf(chunks)).toContain('pong')
    // Not merely "it did not throw": the id the caller passed must be the id
    // stamped on the stream, which is the only thing that makes the replay
    // alignable against the stored log.
    expect(threadIdsOf(chunks)).toEqual([threadId])
    await sbx.destroy()
  })

  it('lets a durable FRESH run generate its own threadId', async () => {
    // The regression bar for the guard: a fresh durable run is the run that
    // ESTABLISHES the threadId, so it must still mint one. A guard keyed on
    // `durable` alone (rather than durable AND attaching) would break this.
    const sbx = await provider.create({})
    await sbx.fs.write('/workspace/fake-codex.mjs', FAKE_CODEX)
    const recorder = recordingHandle(sbx)
    const runId = `r-fresh-thread-${crypto.randomUUID()}`
    const durability = durabilityWith({ attach: false })

    const adapter = codexText('gpt-5.5-codex', {
      codexExecutable: 'node fake-codex.mjs',
    })
    const chunks = await collect(
      adapter.chatStream({
        model: 'gpt-5.5-codex',
        messages: [{ role: 'user', content: 'say pong' }],
        logger: noopLogger,
        runId,
        // threadId intentionally omitted.
        capabilities: capabilityContext(recorder.handle, durability),
      }),
    )

    expect(textOf(chunks)).toContain('pong')
    expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)
    const threadIds = threadIdsOf(chunks)
    expect(threadIds).toHaveLength(1)
    expect(threadIds[0]).toMatch(/.+/)
    await sbx.destroy()
  })

  it('lets a NON-durable run generate its own threadId, unchanged', async () => {
    const sbx = await provider.create({})
    await sbx.fs.write('/workspace/fake-codex.mjs', FAKE_CODEX)
    const recorder = recordingHandle(sbx)

    const adapter = codexText('gpt-5.5-codex', {
      codexExecutable: 'node fake-codex.mjs',
    })
    const chunks = await collect(
      adapter.chatStream({
        model: 'gpt-5.5-codex',
        messages: [{ role: 'user', content: 'say pong' }],
        logger: noopLogger,
        // Neither runId nor threadId, and no durability capability: exactly a
        // pre-durability run.
        capabilities: capabilityContext(recorder.handle),
      }),
    )

    expect(textOf(chunks)).toContain('pong')
    const threadIds = threadIdsOf(chunks)
    expect(threadIds).toHaveLength(1)
    expect(threadIds[0]).toMatch(/.+/)
    await sbx.destroy()
  })
})
