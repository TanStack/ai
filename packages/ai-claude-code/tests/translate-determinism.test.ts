/**
 * Determinism of the journaled path's translation step.
 *
 * `text.ts` wires `createRunScopedIdGen(runId)` as `translateSdkStream`'s
 * `genId` for the NDJSON/journal call site (see `text.ts` around the
 * `spawnNdjson` call and the `mergeChunkStreams` call just below it). A
 * resuming host re-reads the sandbox journal from byte 0 and re-translates
 * it from scratch, so re-translating the same journal bytes must reproduce
 * the same chunks (via `chunkFingerprint`, which is key-order independent
 * and excludes only the wall-clock `timestamp` field) — otherwise a replay
 * cannot recognize what a dead host already delivered and would duplicate
 * text / corrupt tool-call JSON (the client de-dups by offset only, and the
 * stream processor appends unconditionally).
 *
 * What this test covers: `translateSdkStream` alone, fed the same fixture
 * messages twice through two fresh `createRunScopedIdGen(runId)` generators,
 * asserting the two fingerprint arrays are equal — plus a mutation-style
 * "teeth check" that a *non*-run-scoped (random) `genId` makes them diverge.
 *
 * What this test does NOT cover, and why that's a known, accepted gap:
 * `text.ts`'s `chatStream` does not yield `translateSdkStream`'s output
 * directly — it wraps it as
 * `mergeChunkStreams(translateSdkStream(...), channel.stream)`
 * (`packages/ai-claude-code/src/adapters/text.ts:445`). `channel.stream`
 * carries host-tool-bridge CUSTOM events produced by *live* tool execution
 * (`createBridgeEventChannel`, from `@tanstack/ai-sandbox`). On replay:
 *   - those bridge events do not occur at all (no live tool execution
 *     happens during a re-translation of journaled bytes), and
 *   - `mergeChunkStreams`'s interleaving of two async sources is
 *     timing-dependent regardless of any id determinism.
 * So determinism at the `translateSdkStream` level (proven here) does NOT
 * imply determinism of the full *delivered* stream for a run that used
 * bridged tools — that gap is real and is not fixed by this change. It is
 * recorded here deliberately so a later replay/resume phase does not
 * rediscover it as a mysterious mismatch (e.g. a `JournalReplayDivergedError`
 * on a bridged-tool run) without context. Fixing it (e.g. by excluding
 * `channel.stream` from what gets journaled/replayed, or replaying it
 * separately) is out of scope for this task.
 */
import { afterAll, describe, expect, it } from 'vitest'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import {
  chunkFingerprint,
  createRunScopedIdGen,
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
import type { AgentSdkMessage } from '../src/stream/sdk-types'
import type { AdapterYieldChunk } from '@tanstack/ai'

async function* fromArray(
  messages: Array<AgentSdkMessage>,
): AsyncIterable<AgentSdkMessage> {
  for (const message of messages) {
    yield message
  }
}

async function translate(
  messages: Array<AgentSdkMessage>,
  runId: string,
  genId: () => string,
): Promise<Array<AdapterYieldChunk>> {
  const chunks: Array<AdapterYieldChunk> = []
  for await (const chunk of translateSdkStream(fromArray(messages), {
    model: 'claude-opus-4-6',
    runId,
    threadId: 'thread-1',
    genId,
  })) {
    chunks.push(chunk)
  }
  return chunks
}

// Real event shapes copied from `packages/ai-claude-code/tests/translate.test.ts`
// and `packages/ai-claude-code/src/stream/translate.ts` — a text turn plus a
// resolved tool call, which is exactly the shape whose re-appended chunks
// would duplicate text / corrupt tool-call JSON on a naive replay.
const init: AgentSdkMessage = {
  type: 'system',
  subtype: 'init',
  session_id: 'sess-abc',
  model: 'claude-opus-4-6',
  tools: ['Bash', 'Read'],
  cwd: '/tmp',
}

const usage = {
  input_tokens: 100,
  output_tokens: 50,
  cache_read_input_tokens: 10,
  cache_creation_input_tokens: 5,
}

const resultSuccess: AgentSdkMessage = {
  type: 'result',
  subtype: 'success',
  result: 'done',
  usage,
  total_cost_usd: 0.12,
}

function fixtureMessages(): Array<AgentSdkMessage> {
  return [
    init,
    {
      type: 'assistant',
      message: {
        id: 'msg-1',
        content: [
          {
            type: 'tool_use',
            id: 'toolu_1',
            name: 'Bash',
            input: { command: 'ls' },
          },
        ],
      },
      parent_tool_use_id: null,
    },
    {
      type: 'user',
      message: {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_1',
            content: 'file-a\nfile-b',
          },
        ],
      },
      parent_tool_use_id: null,
    },
    {
      type: 'assistant',
      message: {
        id: 'msg-2',
        content: [{ type: 'text', text: 'Found two files.' }],
      },
      parent_tool_use_id: null,
    },
    resultSuccess,
  ]
}

describe('translateSdkStream journaled-path determinism', () => {
  it('re-translating the same journal bytes with fresh run-scoped id generators produces identical fingerprints', async () => {
    const runId = 'run-determinism-1'

    const first = await translate(
      fixtureMessages(),
      runId,
      createRunScopedIdGen(runId),
    )
    const second = await translate(
      fixtureMessages(),
      runId,
      createRunScopedIdGen(runId),
    )

    expect(first.length).toBeGreaterThan(0)
    expect(first.map(chunkFingerprint)).toEqual(second.map(chunkFingerprint))
  })

  it('teeth check: a non-run-scoped (random) genId makes the two translations diverge', async () => {
    const runId = 'run-determinism-2'
    const randomGenId = () =>
      `${runId}-${Date.now()}-${Math.random().toString(36).slice(2)}`

    const first = await translate(fixtureMessages(), runId, randomGenId)
    const second = await translate(fixtureMessages(), runId, randomGenId)

    expect(first.length).toBeGreaterThan(0)
    expect(first.map(chunkFingerprint)).not.toEqual(
      second.map(chunkFingerprint),
    )
  })
})

// --- Wiring check: the actual adapter call site (not just the translator) ---
//
// The two tests above exercise `translateSdkStream` directly with a
// generator we construct ourselves, so they cannot catch a regression at the
// `chatStream` call site in `../src/adapters/text.ts` (e.g. reverting
// `genId: createRunScopedIdGen(runId)` back to
// `genId: () => this.generateId()`). This block runs the real adapter, via
// the same `localProcessSandbox` harness `text-adapter.test.ts` uses, and
// asserts:
//   1. message ids follow the `${runId}-N` shape `createRunScopedIdGen`
//      produces — a shape `this.generateId()`
//      (`${name}-${Date.now()}-${random}`) never produces, and
//   2. the sandbox journal file for this `runId` actually exists after the
//      run, proving `spawnNdjson` really was called with journal options
//      derived from the resolved durability (not just that the adapter
//      happened to mint run-scoped ids some other way).
//
// Durability note (Phase 3): journaling is now conditional on the
// `SandboxDurabilityCapability` a real `withSandbox(sandbox, { runs,
// durability })` provides — see `journalOptionsFor` in `@tanstack/ai-sandbox`.
// Before Phase 3 this adapter journaled every run unconditionally, so this
// test wires `fakeDurability(runId)` onto the capability context to keep
// exercising the journaled path; `attach.test.ts` covers the NON-durable case
// (no durability wired ⇒ no journal option reaches `spawnNdjson` at all,
// byte-identical to pre-durability behavior).

const baseDir = path.join(
  os.tmpdir(),
  `tanstack-ai-cc-determinism-test-${Date.now()}`,
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

// Stand-in for the `claude` CLI that additionally emits a tool_use +
// tool_result pair — the shape that exercises `genId()` via the
// unconditional `TOOL_CALL_RESULT` path in `handleUser` (see
// `../src/stream/translate.ts`), unlike a bare text-only assistant message
// (whose `messageId` comes from the SDK's own `message.message.id` when
// present, bypassing `genId()` entirely).
const NATIVE_FAKE_CLAUDE = [
  `let input = ''`,
  `process.stdin.on('data', (d) => { input += d })`,
  `process.stdin.on('end', () => {`,
  `  const w = (o) => process.stdout.write(JSON.stringify(o) + '\\n')`,
  `  w({ type: 'system', subtype: 'init', session_id: 'sess-1', model: 'haiku', tools: [] })`,
  `  w({ type: 'assistant', message: { id: undefined, content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'ls' } }] }, parent_tool_use_id: null })`,
  `  w({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'file.txt' }] }, parent_tool_use_id: null })`,
  `  w({ type: 'assistant', message: { id: undefined, content: [{ type: 'text', text: 'pong' }] }, parent_tool_use_id: null })`,
  `  w({ type: 'result', subtype: 'success', result: 'pong', usage: { input_tokens: 1, output_tokens: 1 } })`,
  `})`,
].join('\n')

async function collect(
  stream: AsyncIterable<AdapterYieldChunk>,
): Promise<Array<AdapterYieldChunk>> {
  const out: Array<AdapterYieldChunk> = []
  for await (const chunk of stream) out.push(chunk)
  return out
}

describe('claude-code chatStream wiring (real adapter, journaled call site)', () => {
  it('mints run-scoped message ids and actually journals under the supplied runId', async () => {
    const sbx = await provider.create({})
    await sbx.fs.write('/workspace/fake-claude.mjs', NATIVE_FAKE_CLAUDE)
    const recorder = pollStrategyHandle(sbx)

    // Unique per test run: `journalPaths`'s default directory
    // (`/tmp/tanstack-runs`) is a REAL host path shared across every
    // `local-process` sandbox instance and every test run (unlike the rest of
    // the sandbox filesystem, it is not virtualized under this test's own
    // `baseDir`/`afterAll` cleanup), and the journal file itself is opened
    // `>>` (append-only) by design — see `journaledCommand` in
    // `@tanstack/ai-sandbox`'s `journal.ts`. A fixed literal `runId` would
    // collide with a previous run's leftover journal file (that file
    // survives this test's own `afterAll`) and the read would stop at that
    // STALE run's `__exit` sentinel, silently observing 0 of this run's
    // events. A fresh id per invocation avoids the collision.
    const runId = `run-wiring-check-${Date.now()}-${Math.random().toString(36).slice(2)}`
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
          fakeDurability(runId),
        ),
      }),
    )

    // Both the tool-result chunk (unconditional `genId()` in `handleUser`)
    // and the text-message chunks (`message.message.id ?? genId()`, and
    // `NATIVE_FAKE_CLAUDE` sends `id: undefined`) are backed by `genId()`
    // here, so every `messageId` on the stream is expected to be run-scoped.
    const messageIds = chunks
      .map((c) => (c as { messageId?: unknown }).messageId)
      .filter((id): id is string => typeof id === 'string')

    expect(messageIds.length).toBeGreaterThan(0)
    for (const id of messageIds) {
      expect(id).toMatch(new RegExp(`^${runId}-\\d+$`))
    }

    // Prove `spawnNdjson` was actually invoked with journal options derived
    // from the resolved durability — not merely that the translator happened
    // to receive a run-scoped generator.
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
