/**
 * Wiring test for the durable-run seam in `../src/adapters/text.ts`: the
 * `runId` resolution, the journal option, and the attach-time alignment all
 * come from `getSandboxDurability` (the capability `withSandbox(sandbox,
 * { runs, durability })` provides) rather than being hardcoded.
 *
 * Every `runId` here is unique per test (`crypto.randomUUID()`), and every
 * assertion is against the actual spawned/exec'd COMMAND string — not the
 * journal file's existence — because the journal is deleted once a run
 * reaches its `{"__exit":N}` sentinel (see `translate-determinism.test.ts`'s
 * wiring block for the same rationale).
 */
import { afterAll, describe, expect, it } from 'vitest'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import {
  chunkFingerprint,
  createRunScopedIdGen,
  exitSentinelLine,
  journalPaths,
} from '@tanstack/ai-sandbox'
import { claudeCodeText } from '../src/index'
import { translateSdkStream } from '../src/stream/translate'
import {
  capabilityContextWith,
  fakeDurability,
  noopLogger,
  pollStrategyHandle,
} from './fakes'
import type { AdapterYieldChunk } from '@tanstack/ai'
import type { AgentSdkMessage } from '../src/stream/sdk-types'

const baseDir = path.join(
  os.tmpdir(),
  `tanstack-ai-cc-attach-test-${Date.now()}`,
)
const provider = localProcessSandbox({ baseDir, removeOnDestroy: true })

afterAll(async () => {
  try {
    await fsp.rm(baseDir, { recursive: true, force: true })
  } catch {
    // Windows can report EBUSY here when a child process handle briefly
    // outlives `sbx.destroy()`; a cleanup nicety, not part of what the test
    // verifies.
  }
})

// Same stand-in as `text-adapter.test.ts`: ignores its flags, reads the
// prompt from stdin, then emits stream-json (system/init → assistant text →
// result). The runner filename is asserted to be ABSENT from the spawned
// commands on the attach path, proving the agent was never started.
const FAKE_CLAUDE = [
  `let input = ''`,
  `process.stdin.on('data', (d) => { input += d })`,
  `process.stdin.on('end', () => {`,
  `  const w = (o) => process.stdout.write(JSON.stringify(o) + '\\n')`,
  `  w({ type: 'system', subtype: 'init', session_id: 'sess-abc', model: 'haiku', tools: [] })`,
  `  w({ type: 'assistant', message: { id: 'msg-1', content: [{ type: 'text', text: 'pong' }] }, parent_tool_use_id: null })`,
  `  w({ type: 'result', subtype: 'success', result: 'pong', usage: { input_tokens: 1, output_tokens: 1 } })`,
  `})`,
].join('\n')

function newRunId(label: string): string {
  return `r-${label}-${crypto.randomUUID()}`
}

async function collect(
  stream: AsyncIterable<AdapterYieldChunk>,
): Promise<Array<AdapterYieldChunk>> {
  const out: Array<AdapterYieldChunk> = []
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
function threadIdsOf(chunks: Array<AdapterYieldChunk>): Array<string> {
  const seen = new Set<string>()
  for (const chunk of chunks) {
    const value = (chunk as { threadId?: unknown }).threadId
    if (typeof value === 'string') seen.add(value)
  }
  return [...seen]
}

/**
 * Pre-populate a run's journal directly through the shell (never `fs.write` —
 * see `journal.ts` rule 3: on local-process, `fs.write` resolves `/tmp` under
 * the sandbox root while a shell redirect hits the real host `/tmp`, and only
 * the latter is where the reader looks). Base64-encoded so the NDJSON content
 * (which contains double quotes) never has to survive shell quoting.
 */
async function seedJournal(
  sbx: Awaited<ReturnType<typeof provider.create>>,
  runId: string,
  lines: Array<AgentSdkMessage | { __exit: number }>,
): Promise<void> {
  const paths = journalPaths(runId)
  // The exit sentinel is built by `exitSentinelLine`, never hand-JSON-stringified:
  // it carries a per-run nonce so an agent's own stdout cannot forge it
  // (`ai-sandbox`'s `journal.ts`), and a bare `{"__exit":0}` is therefore agent
  // output that the reader deliberately does NOT stop at.
  const content = `${lines
    .map((l) =>
      '__exit' in l ? exitSentinelLine(paths, l.__exit) : JSON.stringify(l),
    )
    .join('\n')}\n`
  const b64 = Buffer.from(content, 'utf8').toString('base64')
  const result = await sbx.process.exec(
    `mkdir -p ${paths.dir} && printf '%s' ${b64} | base64 -d >> ${paths.journal}`,
  )
  if (result.exitCode !== 0) {
    throw new Error(`seedJournal failed: ${result.stdout} ${result.stderr}`)
  }
}

describe('claude-code durable-run wiring (attach path)', () => {
  it('does NOT journal when no durability is wired — byte-identical to a pre-durability run', async () => {
    // No `SandboxDurabilityCapability` provided at all (the default: an app
    // that hasn't wired `runs`/`durability` into `withSandbox`). Before Phase
    // 3 this adapter journaled every run unconditionally; this pins the new
    // guarantee that a non-durable run's observable behavior — including
    // "does spawnNdjson ever touch a journal file" — is unchanged.
    const sbx = await provider.create({})
    await sbx.fs.write('/workspace/fake-claude.mjs', FAKE_CLAUDE)
    const recorder = pollStrategyHandle(sbx)
    const runId = newRunId('no-durability')

    const adapter = claudeCodeText('haiku', {
      claudeExecutable: 'node fake-claude.mjs',
      streamPartials: false,
      emitDiff: false,
    })

    const chunks = await collect(
      adapter.chatStream({
        model: 'haiku',
        messages: [{ role: 'user', content: 'say pong' }],
        logger: noopLogger,
        runId,
        capabilities: capabilityContextWith(recorder.handle),
      }),
    )

    expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)
    // The agent still ran directly (unjournaled): the argv runner shows up,
    // but no command anywhere references a journal path for this runId.
    expect(
      recorder.spawned.some((command) =>
        command.includes('tanstack-claude-run-'),
      ),
    ).toBe(true)
    const paths = journalPaths(runId)
    expect(
      recorder.spawned.some((command) => command.includes(paths.journal)),
    ).toBe(false)

    await sbx.destroy()
  })

  it('starts the agent and journals under the caller-supplied runId when NOT attaching', async () => {
    const sbx = await provider.create({})
    await sbx.fs.write('/workspace/fake-claude.mjs', FAKE_CLAUDE)
    const recorder = pollStrategyHandle(sbx)
    const runId = newRunId('not-attaching')

    const adapter = claudeCodeText('haiku', {
      claudeExecutable: 'node fake-claude.mjs',
      streamPartials: false,
      emitDiff: false,
    })

    const chunks = await collect(
      adapter.chatStream({
        model: 'haiku',
        messages: [{ role: 'user', content: 'say pong' }],
        logger: noopLogger,
        runId,
        capabilities: capabilityContextWith(
          recorder.handle,
          fakeDurability(runId, { attach: false }),
        ),
      }),
    )

    expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)

    // The agent was actually started (`startJournaledAgent` spawns the runner).
    expect(
      recorder.spawned.some((command) =>
        command.includes('tanstack-claude-run-'),
      ),
    ).toBe(true)

    // ...and its output was journaled under a path derived from THIS runId.
    const paths = journalPaths(runId)
    const journaled = recorder.spawned.filter((command) =>
      command.includes(paths.journal),
    )
    expect(journaled.length).toBeGreaterThan(0)
    expect(journaled.some((command) => command.includes('>>'))).toBe(true)

    await sbx.destroy()
  })

  it('does NOT start an agent when attaching — it only tails the existing journal', async () => {
    const sbx = await provider.create({})
    // No fake-claude.mjs written at all: if the adapter tried to start it,
    // the run would fail with a "file not found"-shaped RUN_ERROR instead of
    // producing the expected chunks below.
    const runId = newRunId('attaching')
    await seedJournal(sbx, runId, [
      {
        type: 'system',
        subtype: 'init',
        session_id: 'sess-attach',
        model: 'haiku',
        tools: [],
      },
      {
        type: 'assistant',
        message: { id: 'msg-1', content: [{ type: 'text', text: 'resumed' }] },
        parent_tool_use_id: null,
      },
      {
        type: 'result',
        subtype: 'success',
        result: 'resumed',
        usage: { input_tokens: 1, output_tokens: 1 },
      },
      { __exit: 0 },
    ])
    const recorder = pollStrategyHandle(sbx)

    const adapter = claudeCodeText('haiku', {
      claudeExecutable: 'node fake-claude.mjs',
      streamPartials: false,
      emitDiff: false,
    })

    const chunks = await collect(
      adapter.chatStream({
        model: 'haiku',
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
        threadId: `t-attaching-${crypto.randomUUID()}`,
        capabilities: capabilityContextWith(
          recorder.handle,
          fakeDurability(runId, { attach: true }),
        ),
      }),
    )

    // Translated from the pre-existing journal, proving the read (not a live
    // spawn) is what produced this content.
    const text = chunks
      .filter((c) => c.type === 'TEXT_MESSAGE_CONTENT')
      .map((c) => (c as { delta?: string }).delta ?? '')
      .join('')
    expect(text).toContain('resumed')
    expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)

    // No command ever referenced the argv runner: the agent was never
    // started on the attach path.
    expect(
      recorder.spawned.some((command) =>
        command.includes('tanstack-claude-run-'),
      ),
    ).toBe(false)

    // A read command against this run's journal DID happen.
    const paths = journalPaths(runId)
    expect(
      recorder.spawned.some((command) => command.includes(paths.journal)),
    ).toBe(true)

    await sbx.destroy()
  })

  it('suppresses already-delivered chunks on attach via alignedIfAttaching', async () => {
    // Proves `alignedIfAttaching` is actually IN the pipe, not merely that a
    // fresh translation of the journal happens to look right. A durability
    // adapter whose stored log already holds a PREFIX of what this run's
    // journal translates to must have that prefix suppressed from the
    // delivered stream — that suppression is `alignedIfAttaching`'s entire
    // job (`align.ts`), and nothing else in this call site removes chunks.
    const sbx = await provider.create({})
    const runId = newRunId('align-proof')
    const threadId = `t-${runId}`
    const seedMessages: Array<AgentSdkMessage> = [
      {
        type: 'system',
        subtype: 'init',
        session_id: 'sess-align',
        model: 'haiku',
        tools: [],
      },
      {
        type: 'assistant',
        message: { id: 'msg-1', content: [{ type: 'text', text: 'resumed' }] },
        parent_tool_use_id: null,
      },
      {
        type: 'result',
        subtype: 'success',
        result: 'resumed',
        usage: { input_tokens: 1, output_tokens: 1 },
      },
    ]
    await seedJournal(sbx, runId, [...seedMessages, { __exit: 0 }])

    // Independently reproduce what `chatStream`'s own translation will emit:
    // same messages, same `model`/`runId`/`threadId`, same
    // `createRunScopedIdGen(runId)` — deterministic, per
    // `translate-determinism.test.ts`.
    async function* asMessages(): AsyncIterable<AgentSdkMessage> {
      for (const m of seedMessages) yield m
    }
    const fullTranslation: Array<AdapterYieldChunk> = []
    for await (const chunk of translateSdkStream(asMessages(), {
      model: 'haiku',
      runId,
      threadId,
      genId: createRunScopedIdGen(runId),
    })) {
      fullTranslation.push(chunk)
    }
    expect(fullTranslation.length).toBeGreaterThan(1)

    // Mark everything but the LAST chunk as "already delivered" by a
    // predecessor host: append it straight to the adapter this run's
    // durability will read back via `snapshot()`.
    const alreadyDelivered = fullTranslation.slice(0, -1)
    const notYetDelivered = fullTranslation.slice(-1)
    const durability = fakeDurability(runId, { attach: true })
    await durability.adapter.append(alreadyDelivered)

    const recorder = pollStrategyHandle(sbx)
    const adapter = claudeCodeText('haiku', {
      claudeExecutable: 'node fake-claude.mjs',
      streamPartials: false,
      emitDiff: false,
    })

    const chunks = await collect(
      adapter.chatStream({
        model: 'haiku',
        messages: [{ role: 'user', content: 'say pong' }],
        logger: noopLogger,
        runId,
        threadId,
        capabilities: capabilityContextWith(recorder.handle, durability),
      }),
    )

    // Every chunk in `alreadyDelivered` is suppressed; only the tail this
    // durability adapter had NOT yet seen comes through. Compared via
    // `chunkFingerprint` (key-order independent, excludes the wall-clock
    // `timestamp`) since the two translations run at different instants.
    expect(chunks.map(chunkFingerprint)).toEqual(
      notYetDelivered.map(chunkFingerprint),
    )

    await sbx.destroy()
  })

  it('throws DurableRunIdRequiredError (surfaced as a RUN_ERROR) when durability is wired without a runId', async () => {
    const sbx = await provider.create({})
    await sbx.fs.write('/workspace/fake-claude.mjs', FAKE_CLAUDE)
    // `fakeDurability` needs SOME runId to build its `memoryStream` adapter
    // key, but that id is never passed to `chatStream` — the point of this
    // test is the ABSENCE of `options.runId`.
    const durability = fakeDurability(newRunId('unused-adapter-key'))

    const adapter = claudeCodeText('haiku', {
      claudeExecutable: 'node fake-claude.mjs',
      streamPartials: false,
      emitDiff: false,
    })

    const chunks = await collect(
      adapter.chatStream({
        model: 'haiku',
        messages: [{ role: 'user', content: 'say pong' }],
        logger: noopLogger,
        // runId intentionally omitted
        capabilities: capabilityContextWith(sbx, durability),
      }),
    )

    const runError = chunks.find((c) => c.type === 'RUN_ERROR')
    expect(runError).toBeDefined()
    expect((runError as { message?: string }).message).toMatch(
      /caller-supplied `runId`/,
    )

    await sbx.destroy()
  })

  it('throws DurableThreadIdRequiredError (surfaced as a RUN_ERROR) when ATTACHING without a threadId', async () => {
    // The silent-divergence hole this closes: `threadId` lands in every emitted
    // chunk, so an attach that mints a fresh one replays a stream the stored log
    // cannot match at index 0. Before this guard the run started, read the
    // journal, and only then failed alignment mid-stream.
    const sbx = await provider.create({})
    const runId = newRunId('attach-no-thread')
    // No journal seeded and no fake agent written: the refusal must precede
    // both, so neither is needed for this to fail deterministically.
    const adapter = claudeCodeText('haiku', {
      claudeExecutable: 'node fake-claude.mjs',
      streamPartials: false,
      emitDiff: false,
    })

    const chunks = await collect(
      adapter.chatStream({
        model: 'haiku',
        messages: [{ role: 'user', content: 'say pong' }],
        logger: noopLogger,
        runId,
        // threadId intentionally omitted — the whole point of this test.
        capabilities: capabilityContextWith(
          sbx,
          fakeDurability(runId, { attach: true }),
        ),
      }),
    )

    const runError = chunks.find((c) => c.type === 'RUN_ERROR')
    expect(runError).toBeDefined()
    expect((runError as { message?: string }).message).toMatch(
      /ATTACHING durable sandboxed run requires the run record's `threadId`/,
    )

    await sbx.destroy()
  })

  it('carries a caller-supplied threadId into the chunks when ATTACHING', async () => {
    const sbx = await provider.create({})
    const runId = newRunId('attach-with-thread')
    const threadId = `t-reused-${crypto.randomUUID()}`
    await seedJournal(sbx, runId, [
      {
        type: 'system',
        subtype: 'init',
        session_id: 'sess-attach',
        model: 'haiku',
        tools: [],
      },
      {
        type: 'assistant',
        message: { id: 'msg-1', content: [{ type: 'text', text: 'resumed' }] },
        parent_tool_use_id: null,
      },
      {
        type: 'result',
        subtype: 'success',
        result: 'resumed',
        usage: { input_tokens: 1, output_tokens: 1 },
      },
      { __exit: 0 },
    ])
    const recorder = pollStrategyHandle(sbx)

    const adapter = claudeCodeText('haiku', {
      claudeExecutable: 'node fake-claude.mjs',
      streamPartials: false,
      emitDiff: false,
    })
    const chunks = await collect(
      adapter.chatStream({
        model: 'haiku',
        messages: [{ role: 'user', content: 'say pong' }],
        logger: noopLogger,
        runId,
        threadId,
        // Empty stored log, so nothing is suppressed and the chunks that carry
        // `threadId` are observable.
        capabilities: capabilityContextWith(
          recorder.handle,
          fakeDurability(runId, { attach: true }),
        ),
      }),
    )

    expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)
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
    await sbx.fs.write('/workspace/fake-claude.mjs', FAKE_CLAUDE)
    const recorder = pollStrategyHandle(sbx)
    const runId = newRunId('fresh-thread')

    const adapter = claudeCodeText('haiku', {
      claudeExecutable: 'node fake-claude.mjs',
      streamPartials: false,
      emitDiff: false,
    })
    const chunks = await collect(
      adapter.chatStream({
        model: 'haiku',
        messages: [{ role: 'user', content: 'say pong' }],
        logger: noopLogger,
        runId,
        // threadId intentionally omitted.
        capabilities: capabilityContextWith(
          recorder.handle,
          fakeDurability(runId, { attach: false }),
        ),
      }),
    )

    expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)
    const threadIds = threadIdsOf(chunks)
    expect(threadIds).toHaveLength(1)
    expect(threadIds[0]).toMatch(/.+/)

    await sbx.destroy()
  })

  it('lets a NON-durable run generate its own threadId, unchanged', async () => {
    const sbx = await provider.create({})
    await sbx.fs.write('/workspace/fake-claude.mjs', FAKE_CLAUDE)
    const recorder = pollStrategyHandle(sbx)

    const adapter = claudeCodeText('haiku', {
      claudeExecutable: 'node fake-claude.mjs',
      streamPartials: false,
      emitDiff: false,
    })
    const chunks = await collect(
      adapter.chatStream({
        model: 'haiku',
        messages: [{ role: 'user', content: 'say pong' }],
        logger: noopLogger,
        // Neither runId nor threadId, and no durability capability: exactly a
        // pre-durability run.
        capabilities: capabilityContextWith(recorder.handle),
      }),
    )

    expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)
    const threadIds = threadIdsOf(chunks)
    expect(threadIds).toHaveLength(1)
    expect(threadIds[0]).toMatch(/.+/)

    await sbx.destroy()
  })
})
