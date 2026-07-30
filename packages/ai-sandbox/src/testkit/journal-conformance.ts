/**
 * Provider conformance for the agent output journal.
 *
 * The journal design rests on two provider-level claims: a command string is
 * framed through a POSIX shell (so `>>` redirection works), and `tail -c +N -f`
 * is available. Both are asserted here against a real sandbox rather than
 * assumed from the audit.
 *
 * A provider that cannot satisfy them MUST declare `unsupported.reason`. There
 * is deliberately no silent-skip path: a conformance case that quietly returns
 * prints as a pass, which is how an unimplemented capability ships green. The
 * two FOLLOW cases obey the same rule through a second declaration,
 * {@link JournalConformanceConfig.followUnsupported} — see {@link itFollows} for
 * why the strategy has to be declared rather than detected at registration time,
 * and {@link expectDeclaredStrategy} for what keeps the declaration honest.
 *
 * Vitest is an OPTIONAL peer dependency: this module is imported only from test
 * files, which already run under Vitest.
 */
import { describe, expect, it } from 'vitest'
import {
  exitSentinelLine,
  journalExistsCommand,
  journalPaths,
  journalReadCommand,
  journaledCommand,
} from '../journal'
import { journalReadStrategy, readJournal } from '../journal-reader'
import type { JournalPaths } from '../journal'
import type { SandboxHandle } from '../contracts'

export interface JournalConformanceConfig {
  /** Provider name, used in the describe title. */
  name: string
  /** Create a live sandbox plus its teardown. */
  createHandle: () => Promise<{
    handle: SandboxHandle
    dispose: () => Promise<void>
  }>
  /**
   * Declare that this provider cannot journal, with the reason. Registers a
   * skipped case whose title carries the reason. Omit it and the suite runs.
   */
  unsupported?: { reason: string }
  /**
   * Declare that this provider's reads take the POLL strategy rather than the
   * FOLLOW one — i.e. `journalReadStrategy` answers `'poll'` for its handles,
   * because it lacks `backgroundProcesses` or `killableProcesses`. The two follow
   * cases then register as NAMED skips carrying the reason.
   *
   * Declare this ONLY when the provider really cannot follow. It is checked
   * against a live handle in a case that always runs
   * ({@link expectDeclaredStrategy}), so a wrong declaration fails the suite in
   * either direction rather than quietly removing coverage.
   */
  followUnsupported?: { reason: string }
}

/** Per-case timeout. Every case here spawns a real sandbox and a real agent. */
const CASE_TIMEOUT_MS = 60_000

/**
 * Register a case that only means anything on a provider whose reads FOLLOW.
 *
 * `journalReadStrategy` needs a live handle and a live handle needs the async
 * `createHandle`, so the strategy is not knowable when the cases are registered.
 * It is therefore DECLARED, and the declaration selects `it` or `it.skip` here.
 *
 * This exists because the alternative — checking the strategy inside the case and
 * returning early — is the silent-skip the module doc forbids. Such a case prints
 * `✓` with a duration and a title claiming a property was verified while every
 * real assertion in it (including the `firstLineMs` incremental-delivery bound,
 * which is the entire reason the follow path exists) was skipped. A named
 * `it.skip` prints `↓` with the reason instead.
 */
function itFollows(
  config: JournalConformanceConfig,
  title: string,
  fn: () => Promise<void>,
): void {
  const unsupported = config.followUnsupported
  if (unsupported === undefined) {
    it(title, fn, CASE_TIMEOUT_MS)
    return
  }
  it.skip(
    `${title} — follow strategy unsupported: ${unsupported.reason}`,
    fn,
    CASE_TIMEOUT_MS,
  )
}

/**
 * Assert the live handle's read strategy is the one the config DECLARED.
 *
 * BOTH directions are defects, and neither is a skip. A provider that declared
 * `followUnsupported` but whose handles do follow silently loses the two cases it
 * could pass. One that declared nothing but polls would reach the follow
 * assertions and fail them for a reason unrelated to journaling — which is what
 * the previous `expect(handle.capabilities.killableProcesses).toBe(false)` branch
 * did to a provider with `backgroundProcesses: false, killableProcesses: true`.
 * Either way the config does not describe the provider, and that is worth
 * failing.
 */
function expectDeclaredStrategy(
  handle: SandboxHandle,
  config: JournalConformanceConfig,
): void {
  expect(journalReadStrategy(handle)).toBe(
    config.followUnsupported === undefined ? 'follow' : 'poll',
  )
}

/** Decode the base64 frame a journal read command produces into raw text. */
function decodeJournalRead(stdout: string): string {
  return Buffer.from(stdout.replace(/\s+/g, ''), 'base64').toString('utf8')
}

/**
 * Block until the run's journal file exists in the sandbox.
 *
 * Through the shell (`journalExistsCommand`), never `handle.fs.exists` — see
 * rule 3 in `../journal.ts`: on local-process the two resolve `/tmp`
 * differently, so an `fs` probe would report the wrong file.
 *
 * Exported for `./reaper-conformance.ts`, which needs the same bounded,
 * shell-only wait before probing a still-producing run. Internal to the testkit;
 * not part of the `./testkit` public surface.
 */
export async function waitForJournal(
  handle: SandboxHandle,
  paths: JournalPaths,
): Promise<void> {
  const deadline = Date.now() + 15_000
  for (;;) {
    const probe = await handle.process.exec(journalExistsCommand(paths))
    if (probe.exitCode === 0) return
    if (Date.now() > deadline) {
      throw new Error(`journal conformance: ${paths.journal} never appeared`)
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

/**
 * Assert `createHandle` satisfies the journal conformance contract. Each `it`
 * gets a fresh sandbox via `createHandle`/`dispose`, so implementations may
 * share process state across calls without cross-test bleed only if
 * `createHandle` returns an isolated sandbox.
 */
export function runJournalConformance(config: JournalConformanceConfig): void {
  describe(`journal conformance — ${config.name}`, () => {
    if (config.unsupported) {
      it.skip(`unsupported: ${config.unsupported.reason}`, () => {
        expect(true).toBe(true)
      })
      return
    }

    it(
      "redirects a command's stdout into the journal and appends the exit sentinel",
      async () => {
        const { handle, dispose } = await config.createHandle()
        try {
          // Checked HERE, in a case that always runs, because
          // `followUnsupported` gates the two follow cases below: a declaration
          // that does not match the live handle must fail the suite rather than
          // remove coverage from it. This is the only place a `poll` declaration
          // can be caught, since the cases it skips never execute.
          expectDeclaredStrategy(handle, config)
          const paths = journalPaths(`conf-${Date.now()}`)
          const command = journaledCommand(
            `printf '{"a":1}\\n{"b":2}\\n'`,
            paths,
          )
          const proc = await handle.process.spawn(command)
          expect(await proc.wait()).toBe(0)

          const read = await handle.process.exec(journalReadCommand(paths, 0))
          const text = decodeJournalRead(read.stdout)
          expect(text).toBe(`{"a":1}\n{"b":2}\n${exitSentinelLine(paths, 0)}\n`)
        } finally {
          await dispose()
        }
      },
      CASE_TIMEOUT_MS,
    )

    it(
      "records the agent's non-zero exit in the sentinel",
      async () => {
        const { handle, dispose } = await config.createHandle()
        try {
          const paths = journalPaths(`conf-exit-${Date.now()}`)
          const proc = await handle.process.spawn(
            journaledCommand('exit 7', paths),
          )
          await proc.wait()
          const read = await handle.process.exec(journalReadCommand(paths, 0))
          const text = decodeJournalRead(read.stdout)
          expect(text).toBe(`${exitSentinelLine(paths, 7)}\n`)
        } finally {
          await dispose()
        }
      },
      CASE_TIMEOUT_MS,
    )

    it(
      "keeps the agent's stderr out of the journal",
      async () => {
        const { handle, dispose } = await config.createHandle()
        try {
          const paths = journalPaths(`conf-err-${Date.now()}`)
          const proc = await handle.process.spawn(
            journaledCommand(
              `printf '{"a":1}\\n'; printf 'a warning\\n' 1>&2`,
              paths,
            ),
          )
          await proc.wait()
          const read = await handle.process.exec(journalReadCommand(paths, 0))
          const text = decodeJournalRead(read.stdout)
          expect(text).toBe(`{"a":1}\n${exitSentinelLine(paths, 0)}\n`)
          expect(text).not.toContain('a warning')
        } finally {
          await dispose()
        }
      },
      CASE_TIMEOUT_MS,
    )

    it(
      'reads incrementally from a byte offset with absolute positions',
      async () => {
        const { handle, dispose } = await config.createHandle()
        try {
          const paths = journalPaths(`conf-seek-${Date.now()}`)
          const proc = await handle.process.spawn(
            journaledCommand(`printf '{"a":1}\\n{"b":2}\\n'`, paths),
          )
          await proc.wait()

          const all = []
          for await (const line of readJournal(handle, {
            paths,
            fromByte: 0,
            strategy: 'poll',
            pollIntervalMs: 0,
            signal: AbortSignal.timeout(5_000),
          })) {
            all.push(line)
            if (all.length === 3) break
          }
          expect(all.map((l) => l.line)).toEqual([
            '{"a":1}',
            '{"b":2}',
            exitSentinelLine(paths, 0),
          ])

          const resumed = []
          for await (const line of readJournal(handle, {
            paths,
            fromByte: all[0]?.endPosition ?? 0,
            strategy: 'poll',
            pollIntervalMs: 0,
            signal: AbortSignal.timeout(5_000),
          })) {
            resumed.push(line)
            if (resumed.length === 2) break
          }
          expect(resumed.map((l) => l.line)).toEqual([
            '{"b":2}',
            exitSentinelLine(paths, 0),
          ])
          expect(resumed[0]?.endPosition).toBe(all[1]?.endPosition)
        } finally {
          await dispose()
        }
      },
      CASE_TIMEOUT_MS,
    )

    // This case is the reason `journalFollowCommand` pipes into nothing.
    // `tail -f journal | base64` delivers ZERO bytes while the agent is still
    // running — measured on GNU coreutils 8.32 `base64` and on busybox 1.36.1
    // `base64` in Alpine — because the encoder buffers its stdout until its
    // stdin closes, which only happens when the reader kills `tail`. So the
    // agent below writes its first line, sleeps, then writes the second: any
    // whole-stream filter reintroduced onto the follow path delivers nothing
    // until teardown and BOTH assertions below fail (no lines at all, and no
    // first line inside the window). Do not "fix" a failure here by widening
    // the window — that is the property under test.
    itFollows(
      config,
      'follows a journal that is still being written',
      async () => {
        // Every assertion below sits after an `await`, so a case that threw its way
        // out of the loop early would report an unrelated failure; this one reports
        // "nothing was asserted", which is the failure this case used to HIDE.
        expect.hasAssertions()
        const { handle, dispose } = await config.createHandle()
        try {
          expectDeclaredStrategy(handle, config)
          const paths = journalPaths(`conf-follow-${Date.now()}`)
          // Not awaited anywhere: reading the `__exit` sentinel below IS the
          // proof it finished. (`SpawnHandle.wait()` is not safe to call after the
          // fact on every provider — local-process registers a `close` listener at
          // call time, so a `wait()` issued after the process already exited never
          // resolves.)
          void handle.process.spawn(
            journaledCommand(
              `printf '{"a":1}\\n'; sleep 6; printf '{"b":2}\\n'`,
              paths,
            ),
          )
          // `tail` on a file that does not exist yet exits immediately, and the
          // agent's spawn and the reader's spawn race. Waiting removes that race
          // WITHOUT touching the property under test: with a buffering filter on
          // the follow path the journal still exists, `tail` still runs, and the
          // reader still receives nothing.
          await waitForJournal(handle, paths)
          const seen: Array<string> = []
          const startedAt = Date.now()
          let firstLineMs = Number.POSITIVE_INFINITY
          for await (const line of readJournal(handle, {
            paths,
            fromByte: 0,
            signal: AbortSignal.timeout(15_000),
          })) {
            firstLineMs = Math.min(firstLineMs, Date.now() - startedAt)
            seen.push(line.line)
            if (seen.length === 3) break
          }
          expect(seen).toEqual([
            '{"a":1}',
            '{"b":2}',
            exitSentinelLine(paths, 0),
          ])
          // Incremental, not merely eventual: the first line must arrive while
          // the agent is still inside its 6s sleep, i.e. long before the journal
          // is complete and long before anything is killed.
          expect(firstLineMs).toBeLessThan(3_000)
        } finally {
          await dispose()
        }
      },
    )

    // The follow read must obey its own AbortSignal rather than waiting for the
    // provider's `kill` to close the stream — a provider whose kill misses a
    // grandchild would otherwise hang the reader past its deadline.
    itFollows(
      config,
      'stops a follow read when its signal aborts, without a consumer break',
      async () => {
        expect.hasAssertions()
        const { handle, dispose } = await config.createHandle()
        try {
          expectDeclaredStrategy(handle, config)
          const paths = journalPaths(`conf-abort-${Date.now()}`)
          // Outlives the read on purpose: the journal must still be open, and the
          // agent still running, when the signal fires.
          const agent = await handle.process.spawn(
            journaledCommand(`printf '{"a":1}\\n'; sleep 30`, paths),
          )
          try {
            await waitForJournal(handle, paths)
            const startedAt = Date.now()
            const seen: Array<string> = []
            // No `break`: only the signal can end this loop.
            for await (const line of readJournal(handle, {
              paths,
              fromByte: 0,
              signal: AbortSignal.timeout(3_000),
            })) {
              seen.push(line.line)
            }
            expect(seen).toEqual(['{"a":1}'])
            // Generous, because it is testing "the signal ends it at all", not
            // how fast: the pre-fix reader rode past its signal entirely.
            expect(Date.now() - startedAt).toBeLessThan(20_000)
          } finally {
            await agent.kill()
          }
        } finally {
          await dispose()
        }
      },
    )
  })
}
