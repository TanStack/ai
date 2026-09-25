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
 * three FOLLOW cases obey the same rule through a second declaration,
 * {@link JournalConformanceConfig.followUnsupported} — see {@link itFollows} for
 * why the strategy has to be declared rather than detected at registration time,
 * and {@link expectDeclaredStrategy} for what keeps the declaration honest.
 *
 * THE THIRD FOLLOW CASE TESTS THE OTHER SIDE OF THE BOUNDARY, and it is here
 * because the first two do not. `killableProcesses` is what selects `'follow'`
 * over `'poll'`, and a wrong `true` means `tail -f` is spawned on the assumption
 * it can be reclaimed — leaking one follower per run when it cannot. The two
 * follow cases only ever asserted that the READER stops, which
 * `journal-reader.ts`'s `untilAborted` guarantees on its own by abandoning the
 * pipe the moment the signal fires. So both of them pass a provider whose
 * `kill()` is `() => Promise.resolve()`, and three of the four `true`
 * declarations in this repo were in fact false: Docker's `stream.destroy()` only
 * detached the client, local-process's `sh -c` forks so signalling the shell left
 * the command alive, and Vercel's `kill()` never called the SDK's real
 * `Command.kill` at all. Every one of them shipped green through this suite.
 * "kills the sandbox-side process, not just the host's view of it" is the case
 * that fails them — see its own comment for how it probes.
 *
 * Vitest is an OPTIONAL peer dependency: this module is imported only from test
 * files, which already run under Vitest.
 */
import { randomUUID } from 'node:crypto'
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

/**
 * Per-case timeout. Every case here spawns a real sandbox and a real agent.
 *
 * 180s, not the 60s this used to be, and it matches the ceiling
 * `takeover-conformance.ts` already gives its heaviest cases. It is the one
 * wall-clock number left in the file and it is deliberately far outside the range
 * any healthy run needs: a case here makes half a dozen provider round-trips, and
 * ONE `docker exec` on a loaded daemon has been measured at 9.6s (see
 * `takeover-conformance.ts`'s `countingExec`) and at 20–45s on a saturated one, so
 * a 60s budget put the timeout itself in the same load-sensitive class as the
 * assertions that were removed from these cases — measured going red on cases that
 * pass in 7–13s each on a quiet machine.
 *
 * This bound exists only so a genuine hang FAILS instead of parking CI; it is not
 * an assertion about speed, and nothing here should be tuned to sit near it.
 */
const CASE_TIMEOUT_MS = 180_000

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
 * real assertion in it (including the incremental-delivery handshake, which is
 * the entire reason the follow path exists) was skipped. A named `it.skip` prints
 * `↓` with the reason instead.
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
    await sleep(100)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * An absolute path inside the sandbox that no other case, suite, or machine will
 * touch.
 *
 * Every character is in `[A-Za-z0-9./-]`, so these interpolate into the shell
 * commands below as a single word without quoting. `/tmp` and not the workspace:
 * on local-process a shell redirect reaches the host's real `/tmp` while
 * `handle.fs` resolves under the sandbox root (see rule 3 in `../journal.ts`),
 * and everything here is written AND read through the shell so the two never have
 * to agree.
 */
function noncePath(label: string): string {
  return `/tmp/tanstack-journal-conformance-${label}-${randomUUID()}`
}

/** Iteration cap on the kill probe's loop, so nothing can outlive the suite. */
const PROBE_MAX_TICKS = 600

/**
 * Bound on a journal read, so a reader that delivers nothing FAILS instead of
 * parking CI.
 *
 * Never an assertion, and deliberately far above anything a healthy read needs
 * (measured: 10–18s for the follow cases on both providers). Each case that uses
 * it proves its property some other way — a causal handshake, or
 * `backstop.aborted` — so this number can be raised freely and must never be the
 * thing a case is tuned against.
 */
const READ_BACKSTOP_MS = 90_000

/**
 * How long to let an asynchronous kill land before the quiet window opens.
 *
 * A kill is asynchronous on every provider here — Docker signals through a
 * second `exec`, local-process signals a process group and lets the OS reap — so
 * one more heartbeat tick immediately after `kill()` resolves is not a survivor.
 */
const KILL_SETTLE_MS = 5_000

/**
 * The quiet window: how long the heartbeat must stay frozen.
 *
 * This is NOT a load-sensitive bound, and the asymmetry is the point. A dead
 * process can never write again, so a slow or busy machine can only make this
 * window MORE reliable, never less — unlike a "must happen within Nms" ceiling,
 * which fails on load. Only a live survivor can end this window, and a live
 * survivor writes once a second.
 */
const HEARTBEAT_QUIET_MS = 6_000

/**
 * Byte count of `path`, according to the SANDBOX'S OWN shell, or `null` when it
 * cannot be read.
 *
 * `wc -c` through the shell, never `handle.fs`: on local-process the two resolve
 * `/tmp` differently (rule 3), so an `fs` probe would answer about a file the
 * sandbox never wrote and the growth below would look frozen from the first
 * sample — a vacuous pass. Parsed strictly rather than coerced, so a shell
 * diagnostic cannot become `NaN` and compare unequal to itself.
 */
async function fileSize(
  handle: SandboxHandle,
  path: string,
): Promise<number | null> {
  const probe = await handle.process.exec(`wc -c < ${path} 2>/dev/null`)
  const text = probe.stdout.trim()
  return /^\d+$/.test(text) ? Number(text) : null
}

/**
 * Wait until `path` has grown to at least `bytes`, i.e. the probe process is
 * provably DOING WORK inside the sandbox, and answer whether it got there.
 *
 * Returning the observation rather than throwing keeps the verdict inside the
 * case's own `expect`: this is the "before" half of the assertion, and it is what
 * makes the "after" half a live detector instead of a formality.
 */
async function waitForTicks(
  handle: SandboxHandle,
  path: string,
  bytes: number,
): Promise<boolean> {
  const deadline = Date.now() + 30_000
  for (;;) {
    const size = await fileSize(handle, path)
    if (size !== null && size >= bytes) return true
    if (Date.now() > deadline) return false
    // Matched to the heartbeat's own 1s period on purpose. Every poll is a
    // provider round-trip, so a 250ms interval spent three of them per tick it
    // could not possibly observe — pure pressure on the very `exec` path the rest
    // of the case depends on.
    await sleep(1_000)
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
            // Not an assertion — see {@link READ_BACKSTOP_MS}. This was
            // `AbortSignal.timeout(5_000)`, and it is a POLL read, so it costs one
            // provider round-trip per line: measured going red on a saturated
            // Docker daemon where a single `exec` took ~20s, while the lines it
            // asserts were perfectly correct.
            signal: AbortSignal.timeout(READ_BACKSTOP_MS),
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
            signal: AbortSignal.timeout(READ_BACKSTOP_MS),
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
    // stdin closes, which only happens when the reader kills `tail`.
    //
    // INCREMENTAL, NOT MERELY EVENTUAL, AND PROVED CAUSALLY RATHER THAN BY A
    // STOPWATCH. The agent writes its first line and then BLOCKS on a gate file
    // that only this reader can create, and it creates it only on receiving that
    // first line. So the agent cannot reach its second line until the first was
    // delivered — receiving `{"b":2}` at all IS the proof of incremental
    // delivery, and the `toEqual` below is the whole assertion. A buffering
    // filter reintroduced onto the follow path deadlocks instead: nothing is
    // delivered, the gate is never created, the agent never writes its second
    // line, the read ends on its signal and `seen` is empty.
    //
    // This replaced `expect(firstLineMs).toBeLessThan(3_000)`, which measured
    // MACHINE LOAD as much as behavior: it was observed failing in whole-suite
    // fleet runs while passing 5/5 in isolation, because one `exec`/`spawn` is a
    // provider round-trip whose latency this suite does not control (a
    // `docker exec` on a loaded daemon has been measured at 9.6s). Same instinct
    // as `takeover-conformance.ts`'s `countingExec`: anchor on the property, not
    // on the clock. A bound that goes red on a busy machine teaches people to
    // ignore the suite. Do NOT "fix" a failure here by widening a window —
    // there is no window left to widen.
    itFollows(
      config,
      'follows a journal that is still being written, delivering each line before the next is produced',
      async () => {
        // Every assertion below sits after an `await`, so a case that threw its way
        // out of the loop early would report an unrelated failure; this one reports
        // "nothing was asserted", which is the failure this case used to HIDE.
        expect.hasAssertions()
        const { handle, dispose } = await config.createHandle()
        const gate = noncePath('follow-gate')
        try {
          expectDeclaredStrategy(handle, config)
          const paths = journalPaths(`conf-follow-${Date.now()}`)
          // The wait is bounded in the SANDBOX too, and on timeout it emits a
          // line that names what went wrong instead of the expected one — so a
          // gate that never arrives fails the `toEqual` with `{"gate":"never"}`
          // rather than eventually satisfying it. 30 ticks so that diagnostic
          // lands INSIDE `CASE_TIMEOUT_MS`; a longer cap would just time the case
          // out and lose the message.
          const agentCommand =
            `printf '{"a":1}\\n'; ` +
            `i=0; while [ ! -f ${gate} ]; do ` +
            `i=$((i+1)); ` +
            `if [ $i -gt 30 ]; then printf '{"gate":"never"}\\n'; break; fi; ` +
            `sleep 1; done; ` +
            `printf '{"b":2}\\n'`
          // Not awaited anywhere: reading the `__exit` sentinel below IS the
          // proof it finished. (`SpawnHandle.wait()` is not safe to call after the
          // fact on every provider — local-process registers a `close` listener at
          // call time, so a `wait()` issued after the process already exited never
          // resolves.)
          void handle.process.spawn(journaledCommand(agentCommand, paths))
          // `tail` on a file that does not exist yet exits immediately, and the
          // agent's spawn and the reader's spawn race. Waiting removes that race
          // WITHOUT touching the property under test: with a buffering filter on
          // the follow path the journal still exists, `tail` still runs, and the
          // reader still receives nothing.
          await waitForJournal(handle, paths)
          // The premise, pinned: the gate is genuinely absent, so the agent
          // really is blocked and its second line really is downstream of this
          // reader. Without this a pre-existing gate path would make the case
          // pass without following anything.
          expect(
            (await handle.process.exec(`test -e ${gate}`)).exitCode,
          ).not.toBe(0)
          const seen: Array<string> = []
          for await (const line of readJournal(handle, {
            paths,
            fromByte: 0,
            // Not the assertion — see {@link READ_BACKSTOP_MS}. The gate's own
            // 30-tick cap fires well inside it, so the `{"gate":"never"}`
            // diagnostic still reaches this reader.
            signal: AbortSignal.timeout(READ_BACKSTOP_MS),
          })) {
            seen.push(line.line)
            // Releases the agent, and only from inside the stream. `touch` is
            // not portable to every BusyBox build with these flags, so this
            // creates the file with a redirect, through the shell — `handle.fs`
            // would write a path the agent's `test -f` cannot see on
            // local-process (rule 3).
            if (seen.length === 1) {
              await handle.process.exec(`: >> ${gate}`)
            }
            if (seen.length === 3) break
          }
          expect(seen).toEqual([
            '{"a":1}',
            '{"b":2}',
            exitSentinelLine(paths, 0),
          ])
        } finally {
          // Unblocks the agent even when the case failed, so no `while` loop
          // outlives it on a provider whose sandbox teardown does not reap.
          await handle.process.exec(`: >> ${gate}`).catch(() => undefined)
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
            const seen: Array<string> = []
            // The signal fires ON the first line rather than on a stopwatch. The
            // old form was `AbortSignal.timeout(3_000)`, which asked the provider
            // to spawn a `tail` AND deliver a line inside 3s — measured failing on
            // a loaded Windows machine (git-bash `sh` + `tail`, `seen` came back
            // empty) while passing in isolation, the same load-sensitivity as the
            // `firstLineMs` bound the case above replaced. Aborting from inside the
            // stream keeps the property exactly: the agent is still running, the
            // journal is still open, and the reader must stop because its SIGNAL
            // said so.
            const stop = new AbortController()
            // A backstop, so a reader that delivers nothing fails instead of
            // parking CI. It is not the assertion — `backstopped` below proves it
            // was not what ended the loop.
            const backstop = AbortSignal.timeout(READ_BACKSTOP_MS)
            for await (const line of readJournal(handle, {
              paths,
              fromByte: 0,
              signal: AbortSignal.any([stop.signal, backstop]),
            })) {
              seen.push(line.line)
              // No `break`, ever: the pre-fix reader honored a consumer break but
              // rode straight past its signal, so a `break` here would pass it.
              stop.abort()
            }
            expect({ seen, backstopped: backstop.aborted }).toEqual({
              seen: ['{"a":1}'],
              // The loop ended, and NOT because the backstop timed out — which is
              // the causal witness that "the signal ends it at all", with no clock
              // in the assertion.
              backstopped: false,
            })
          } finally {
            await agent.kill()
          }
        } finally {
          await dispose()
        }
      },
    )

    // THE CAPABILITY, not the reader's reaction to it.
    //
    // `killableProcesses` is the flag `journalReadStrategy` reads to choose
    // `'follow'`, and the promise it makes is about the SANDBOX-SIDE process:
    // `tail -f` may be spawned because the caller can reclaim it. Every other
    // case in this file asserts only that the READER stopped, which
    // `untilAborted` delivers unilaterally by abandoning the pipe — so all of
    // them pass a provider whose `kill()` is `() => Promise.resolve()`. This one
    // asks the sandbox itself.
    //
    // WHAT IT SPAWNS, AND WHY THAT SHAPE. The heartbeat loop is BACKGROUNDED
    // (`( … ) & wait`), so the long-lived work is a grandchild of the wrapper
    // shell rather than the wrapper itself. That is deliberate: it is the shape
    // of the defects this bites on. `sh -c '<cmd>'` does not reliably exec its
    // command, so a provider that signals only the wrapper leaves the real work
    // running — measured on local-process POSIX, where `sh -c 'sleep 987654321'`
    // survived `child.kill('SIGKILL')` — and Docker's `kill -SIG -"$pid"` group
    // form exists precisely so a backgrounded grandchild is not orphaned. A probe
    // that `exec`ed itself into the wrapper would be reclaimed by the correct and
    // the broken implementation alike, and prove nothing.
    //
    // WHY IT MEASURES WORK AND NOT EXISTENCE. `kill -0 <pid>` was the obvious
    // probe and it is WRONG here, measured: alpine's PID 1 under this provider is
    // `tail -f /dev/null`, which never `wait()`s, so a correctly killed child
    // lingers as an unreaped `[sleep]` forever and `kill -0` answers 0 for it.
    // That fails a healthy provider. `ps` is no better and is why the identity
    // here is a file rather than a nonce in the command line: on local-process
    // under Windows the shell is git-bash, whose MSYS `ps` prints only the process
    // IMAGE PATH (`/usr/bin/sleep`) and never argv — verified, `ps`, `ps -ef` and
    // `ps -W` all omit it — so `ps | grep <nonce>` would match nothing there, and
    // "no match" is indistinguishable from "it is gone": a vacuous pass on
    // exactly the provider whose kill was broken. (`pgrep` is worse: BusyBox has
    // it, git-bash does not.) A host-side census is not portable at all — Docker's
    // container-side process has no host process, and a remote provider has none
    // either.
    //
    // So the probe is a heartbeat: the process appends one byte per second to a
    // nonce-named file, through the shell. Only a RUNNING process can do that. A
    // zombie cannot, a killed process cannot, and no other test on the machine
    // writes to that path.
    //
    // BOTH OBSERVATIONS ARE ASSERTED, in one object, and the "before" one is not
    // decoration: a frozen-file check passes trivially against a file that never
    // grew at all, which is the exact failure shape this whole review keeps
    // turning up. `tickedBeforeKill` is what makes the detector live.
    itFollows(
      config,
      "kills the sandbox-side process, not just the host's view of it",
      async () => {
        expect.hasAssertions()
        const { handle, dispose } = await config.createHandle()
        const heartbeat = noncePath('killprobe-hb')
        const stop = noncePath('killprobe-stop')
        try {
          expectDeclaredStrategy(handle, config)
          // The `stop` file is how a SURVIVOR is reclaimed in teardown, since a
          // provider that fails this case cannot be trusted to kill it and the
          // suite must not leak a spinner either way. The tick cap is the second
          // net, for a teardown that never ran at all.
          const probe = await handle.process.spawn(
            `( i=0; while [ ! -f ${stop} ] && [ $i -lt ${PROBE_MAX_TICKS} ]; do ` +
              `printf '.' >> ${heartbeat}; i=$((i+1)); sleep 1; ` +
              `done ) & wait`,
          )
          // Two bytes, not one: one byte is "it started", two is "it is looping".
          const tickedBeforeKill = await waitForTicks(handle, heartbeat, 2)

          await probe.kill()
          await sleep(KILL_SETTLE_MS)
          const atSettle = await fileSize(handle, heartbeat)
          await sleep(HEARTBEAT_QUIET_MS)
          const afterQuietWindow = await fileSize(handle, heartbeat)

          expect({
            tickedBeforeKill,
            // An UNREADABLE sample counts as a tick, i.e. fails: the file was
            // provably readable a moment ago (`tickedBeforeKill`), so `null` here
            // means the probe itself broke and the quiet window proves nothing.
            // Two `null`s compare equal, which would otherwise read as "frozen".
            tickedAfterKill:
              atSettle === null ||
              afterQuietWindow === null ||
              atSettle !== afterQuietWindow,
          }).toEqual({ tickedBeforeKill: true, tickedAfterKill: false })
        } finally {
          await handle.process
            .exec(`: >> ${stop}; rm -f ${heartbeat}`)
            .catch(() => undefined)
          await dispose()
        }
      },
    )
  })
}
