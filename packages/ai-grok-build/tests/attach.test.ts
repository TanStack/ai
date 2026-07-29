/**
 * Durable-run wiring for the Grok Build NDJSON path: the journal options the
 * spawn receives, and the alignment an ATTACHING run routes through.
 *
 * These tests deliberately drive the real `localProcessSandbox` rather than a
 * fake handle, because the two things under test are both path-derived: the
 * journal file location comes from `runId` + the configured directory through a
 * shell redirect, and the attach read finds (or does not find) that exact file.
 * A fake `process.spawn` would let a wrong path pass.
 *
 * WHICH SEAM IS UNDER TEST. `ai-grok-build` has two protocol paths and only one
 * of them journals:
 *
 * - `chatStreamAcp` (protocol `'acp'`, the default) merges `translateAcpStream`
 *   with the bridge channel via `mergeChunkStreams`. It never calls
 *   `spawnNdjson`, so it writes no journal and has no stored log to replay.
 * - `chatStreamNdjson` (protocol `'streaming-json'`) is the journaled path:
 *   `spawnNdjson(..., { journal })` then `translateThreadEvents`.
 *
 * So the alignment seam is `translateThreadEvents`, NOT the ACP merge. Every
 * assertion below is on the streaming-json path, and `aligns the final
 * translated chunk sequence…` fails outright if the wrap is moved to the ACP
 * merge, because that leaves this path unaligned.
 */
import { afterAll, describe, expect, it } from 'vitest'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { randomUUID } from 'node:crypto'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import {
  SandboxCapability,
  SandboxDurabilityCapability,
  chunkFingerprint,
  journalPaths,
} from '@tanstack/ai-sandbox'
import { InMemoryRunStore } from '@tanstack/ai'
import { grokBuildText } from '../src/index'
import type { SandboxHandle, SandboxRunDurability } from '@tanstack/ai-sandbox'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type {
  CapabilityContext,
  StreamChunk,
  StreamDurability,
} from '@tanstack/ai'

const baseDir = path.join(
  os.tmpdir(),
  `tanstack-ai-grok-build-attach-${Date.now()}`,
)
const provider = localProcessSandbox({ baseDir, removeOnDestroy: true })

/**
 * A journal directory scoped to this file's run. `/tmp/...` and not the
 * `baseDir` above on purpose: the journal is written through a shell redirect,
 * which resolves `/tmp` against the real shell root rather than the sandbox
 * root (see `journal.ts` rule 3), so pointing it at the sandbox dir would just
 * be misleading about where the bytes land.
 */
const JOURNAL_DIR = `/tmp/tanstack-grok-attach-${randomUUID()}`

afterAll(async () => {
  const sbx = await provider.create({})
  await sbx.process.exec(`rm -rf '${JOURNAL_DIR}'`)
  await sbx.destroy()
  await fsp.rm(baseDir, { recursive: true, force: true })
})

/** Native grok `streaming-json` events, as the harness would have written them. */
const JOURNAL_EVENTS = [
  `{"type":"text","data":"po"}`,
  `{"type":"text","data":"ng"}`,
  `{"type":"end","stopReason":"EndTurn","sessionId":"sess-1"}`,
]

/** The agent-exit sentinel `readJournalNdjson` stops at. */
const EXIT_LINE = `{"__exit":0}`

/**
 * A fake agent for the NON-attach runs, emitting the same events the seeded
 * journal holds so both directions describe one run.
 */
const FAKE_GROK = [
  `const w = (s) => process.stdout.write(s + '\\n')`,
  ...JOURNAL_EVENTS.map((line) => `w(${JSON.stringify(line)})`),
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
 * A `StreamDurability` that is a real accumulating list, so `snapshot()`
 * reflects state rather than always answering empty. Only `snapshot` matters
 * here — the adapter reads the log, it never appends to it.
 */
function fakeLog(entries: Array<StreamChunk> = []): StreamDurability {
  const stored = [...entries]
  return {
    resumeFrom: () => null,
    append: (chunks) => {
      const start = stored.length
      stored.push(...chunks)
      return Promise.resolve(chunks.map((_, i) => `o:${start + i}`))
    },
    read: () => (async function* empty() {})(),
    close: () => Promise.resolve(),
    snapshot: () =>
      Promise.resolve(stored.map((chunk, i) => ({ offset: `o:${i}`, chunk }))),
  }
}

function durabilityWith(
  adapter: StreamDurability,
  attach: boolean,
): SandboxRunDurability {
  return {
    runs: new InMemoryRunStore(),
    adapter,
    journalDir: JOURNAL_DIR,
    attach,
    detachOnDisconnect: true,
    detachedRunTtlMs: 60_000,
  }
}

function contextWith(
  handle: SandboxHandle,
  durability?: SandboxRunDurability,
): CapabilityContext {
  const [, provideSandbox] = SandboxCapability
  const [, provideSandboxDurability] = SandboxDurabilityCapability
  const ctx = {
    capabilities: { markProvided: () => {}, has: () => true },
  } as unknown as CapabilityContext
  provideSandbox(ctx, handle)
  if (durability) provideSandboxDurability(ctx, durability)
  return ctx
}

async function collect(
  stream: AsyncIterable<StreamChunk>,
): Promise<Array<StreamChunk>> {
  const out: Array<StreamChunk> = []
  for await (const chunk of stream) out.push(chunk)
  return out
}

/** Compare chunks ignoring wall-clock fields, exactly as alignment does. */
function fingerprints(chunks: Array<StreamChunk>): Array<string> {
  return chunks.map(chunkFingerprint)
}

/**
 * Write a complete, terminalized journal for `runId` through the shell.
 *
 * Re-seeded before every attach run because `readJournalNdjson` DELETES the
 * journal once it reads the `{"__exit":0}` sentinel (a terminal run's record is
 * the event log, not the journal), so a second attach would otherwise find
 * nothing.
 */
async function seedJournal(
  sbx: SandboxHandle,
  runId: string,
  events: Array<string> = JOURNAL_EVENTS,
): Promise<void> {
  const paths = journalPaths(runId, JOURNAL_DIR)
  const body = [...events, EXIT_LINE]
    .map((line) => `printf '%s\\n' '${line}'`)
    .join('; ')
  const result = await sbx.process.exec(
    `mkdir -p '${paths.dir}' && { ${body}; } > '${paths.journal}'`,
  )
  expect(result.exitCode).toBe(0)
}

function adapter() {
  return grokBuildText('grok-build', {
    grokExecutable: 'node fake-grok.mjs',
    protocol: 'streaming-json',
    // The git-diff chunk is live output from this host and sits OUTSIDE the
    // alignment wrap by design; disabled here so the alignment assertions are
    // about the translated sequence alone. Asserted separately below.
    emitDiff: false,
  })
}

/**
 * A stable `threadId` for the takeover assertions.
 *
 * `chatStream` falls back to `this.generateId()` for a missing `threadId`, and
 * that id is a clock-plus-random value that lands in every chunk — so two
 * replays of the same journal without a caller-supplied `threadId` diverge on
 * `RUN_STARTED` before the first text chunk. A real takeover recomputes the
 * `threadId` from the run record for exactly this reason; alignment is only
 * meaningful when it does.
 */
const THREAD_ID = 'th-attach'

function run(
  sbx: SandboxHandle,
  options: {
    runId?: string
    threadId?: string
    durability?: SandboxRunDurability
  },
): AsyncIterable<StreamChunk> {
  return adapter().chatStream({
    model: 'grok-build',
    messages: [{ role: 'user', content: 'say pong' }],
    logger: noopLogger,
    capabilities: contextWith(sbx, options.durability),
    ...(options.runId === undefined ? {} : { runId: options.runId }),
    ...(options.threadId === undefined ? {} : { threadId: options.threadId }),
  })
}

/**
 * Every test here creates a real sandbox and, on the attach path, tails a real
 * journal file through a shell — so the default 5s budget is not enough. The
 * generous window is a timeout, not an expected duration.
 */
const SANDBOX_TEST_TIMEOUT = 90_000

describe(
  'grok-build durable runId + journal wiring',
  { timeout: SANDBOX_TEST_TIMEOUT },
  () => {
    it('keeps the generated-id fallback and stays unjournaled when durability is NOT wired', async () => {
      const sbx = await provider.create({})
      await sbx.fs.write('/workspace/fake-grok.mjs', FAKE_GROK)

      // No `runId`, no durability capability: today's behavior exactly.
      const chunks = await collect(run(sbx, {}))

      expect(chunks.some((c) => c.type === 'RUN_STARTED')).toBe(true)
      expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)
      const text = chunks
        .filter((c) => c.type === 'TEXT_MESSAGE_CONTENT')
        .map((c) => (c as { delta?: string }).delta ?? '')
        .join('')
      expect(text).toBe('pong')

      // `journalOptionsFor` returned undefined, so the spawn took its original
      // unjournaled path and nothing was written to the journal directory.
      const listing = await sbx.process.exec(`ls '${JOURNAL_DIR}' 2>/dev/null`)
      expect(listing.stdout).toBe('')

      await sbx.destroy()
    })

    it('throws DurableRunIdRequiredError when durability is wired without a runId', async () => {
      const sbx = await provider.create({})
      await sbx.fs.write('/workspace/fake-grok.mjs', FAKE_GROK)

      // The adapter's `catch` turns any throw into a RUN_ERROR chunk, so assert on
      // that rather than on a rejection.
      const chunks = await collect(
        run(sbx, { durability: durabilityWith(fakeLog(), false) }),
      )

      expect(chunks).toHaveLength(1)
      const error = chunks[0] as { type: string; message?: string }
      expect(error.type).toBe('RUN_ERROR')
      expect(error.message).toContain('caller-supplied `runId`')

      await sbx.destroy()
    })

    it('journals under the resolved runId in the configured directory', async () => {
      const sbx = await provider.create({})
      await sbx.fs.write('/workspace/fake-grok.mjs', FAKE_GROK)
      const runId = `r-${randomUUID()}`

      await collect(
        run(sbx, { runId, durability: durabilityWith(fakeLog(), false) }),
      )

      // The journal itself is deleted on the sentinel, but its stderr sidecar is
      // only removed alongside it — so the surviving evidence of the path is the
      // directory the run created, named from `journalDir`, and the fact that the
      // ATTACH assertions below can find a journal written at exactly
      // `journalPaths(runId, JOURNAL_DIR).journal`.
      const dirExists = await sbx.process.exec(`test -d '${JOURNAL_DIR}'`)
      expect(dirExists.exitCode).toBe(0)

      await sbx.destroy()
    })
  },
)

describe(
  'grok-build attach alignment (the translateThreadEvents seam)',
  { timeout: SANDBOX_TEST_TIMEOUT },
  () => {
    /**
     * THE LOAD-BEARING TEST.
     *
     * It asserts the IDENTITY of what alignment compares against the stored log:
     * seeded with the complete translated sequence, an attach delivers nothing;
     * seeded with all but the last, it delivers exactly that last chunk. Both only
     * hold if the aligned stream is the FINAL translated chunk sequence, because
     * `alignToStoredLog` throws `JournalReplayDivergedError` on the first
     * fingerprint mismatch and throws again if the replay is shorter than the log.
     *
     * This is what distinguishes the two candidate seams. `chatStreamAcp`'s
     * `mergeChunkStreams` is in a different method on a different protocol; wrap
     * there instead and this path is unaligned, so the stored prefix is not
     * suppressed and both assertions below fail.
     */
    it('aligns the final translated chunk sequence against the stored log', async () => {
      const sbx = await provider.create({})
      const runId = `r-${randomUUID()}`

      // A first attach against an EMPTY log establishes what a replay of this
      // journal produces — the reference sequence.
      await seedJournal(sbx, runId)
      const replayed = await collect(
        run(sbx, {
          runId,
          threadId: THREAD_ID,
          durability: durabilityWith(fakeLog(), true),
        }),
      )
      expect(replayed.length).toBeGreaterThan(2)
      expect(replayed.some((c) => c.type === 'RUN_STARTED')).toBe(true)
      expect(replayed.some((c) => c.type === 'RUN_FINISHED')).toBe(true)

      // Seeded with the COMPLETE sequence: every replayed chunk matches a stored
      // one, one-for-one and in order, so nothing is left to deliver. A log whose
      // entries were anything other than these translated chunks — raw harness
      // events, pre-translation ACP updates — could not align at all.
      await seedJournal(sbx, runId)
      const nothingNew = await collect(
        run(sbx, {
          runId,
          threadId: THREAD_ID,
          durability: durabilityWith(fakeLog(replayed), true),
        }),
      )
      expect(nothingNew).toEqual([])

      // Seeded with all but the last: exactly the undelivered tail comes through,
      // and it is fingerprint-identical to the final translated chunk.
      await seedJournal(sbx, runId)
      const tail = await collect(
        run(sbx, {
          runId,
          threadId: THREAD_ID,
          durability: durabilityWith(fakeLog(replayed.slice(0, -1)), true),
        }),
      )
      expect(fingerprints(tail)).toEqual(fingerprints(replayed.slice(-1)))

      await sbx.destroy()
    })

    it('does NOT align a non-attach durable run, so a fresh run delivers its own chunks even against a populated log', async () => {
      const sbx = await provider.create({})
      await sbx.fs.write('/workspace/fake-grok.mjs', FAKE_GROK)
      const runId = `r-${randomUUID()}`

      await seedJournal(sbx, runId)
      const reference = await collect(
        run(sbx, { runId, durability: durabilityWith(fakeLog(), true) }),
      )

      // Same runId, a log already holding the whole sequence, but `attach: false`.
      // Alignment must be skipped entirely: suppressing a fresh run's own output
      // because a colliding runId left entries in the log is silent data loss.
      const freshRunId = `r-${randomUUID()}`
      const fresh = await collect(
        run(sbx, {
          runId: freshRunId,
          durability: durabilityWith(fakeLog(reference), false),
        }),
      )

      expect(fresh.some((c) => c.type === 'RUN_STARTED')).toBe(true)
      expect(fresh.some((c) => c.type === 'RUN_FINISHED')).toBe(true)
      const text = fresh
        .filter((c) => c.type === 'TEXT_MESSAGE_CONTENT')
        .map((c) => (c as { delta?: string }).delta ?? '')
        .join('')
      expect(text).toBe('pong')

      await sbx.destroy()
    })

    it('derives the journal path from the runId, so an attach replays ITS run and not another', async () => {
      const sbx = await provider.create({})
      const alpha = `r-${randomUUID()}`
      const beta = `r-${randomUUID()}`

      // Two journals side by side in the same directory, distinguished only by
      // runId. An attach for `beta` must read `beta`'s bytes.
      await seedJournal(sbx, alpha, [
        `{"type":"text","data":"alpha"}`,
        `{"type":"end","stopReason":"EndTurn","sessionId":"s-alpha"}`,
      ])
      await seedJournal(sbx, beta, [
        `{"type":"text","data":"beta"}`,
        `{"type":"end","stopReason":"EndTurn","sessionId":"s-beta"}`,
      ])

      const chunks = await collect(
        run(sbx, {
          runId: beta,
          threadId: THREAD_ID,
          durability: durabilityWith(fakeLog(), true),
        }),
      )

      const text = chunks
        .filter((c) => c.type === 'TEXT_MESSAGE_CONTENT')
        .map((c) => (c as { delta?: string }).delta ?? '')
        .join('')
      expect(text).toBe('beta')
      expect(text).not.toContain('alpha')

      await sbx.destroy()
    })
  },
)
