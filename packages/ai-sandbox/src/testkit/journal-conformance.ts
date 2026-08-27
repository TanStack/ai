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
  unsupported?: { reason: string }
  followUnsupported?: { reason: string }
}

const CASE_TIMEOUT_MS = 180_000

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

function noncePath(label: string): string {
  return `/tmp/tanstack-journal-conformance-${label}-${randomUUID()}`
}

/** Iteration cap on the kill probe's loop, so nothing can outlive the suite. */
const PROBE_MAX_TICKS = 600

const READ_BACKSTOP_MS = 90_000

const KILL_SETTLE_MS = 5_000

const HEARTBEAT_QUIET_MS = 6_000

async function fileSize(
  handle: SandboxHandle,
  path: string,
): Promise<number | null> {
  const probe = await handle.process.exec(`wc -c < ${path} 2>/dev/null`)
  const text = probe.stdout.trim()
  return /^\d+$/.test(text) ? Number(text) : null
}

async function waitForTicks(
  handle: SandboxHandle,
  path: string,
  bytes: number,
): Promise<boolean> {
  const deadline = Date.now() + 30_000
  for (;;) {
    const size = await fileSize(handle, path)
    const hasEnoughBytes = size !== null && size >= bytes
    if (hasEnoughBytes) return true
    if (Date.now() > deadline) return false
    await sleep(1_000)
  }
}

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
          const firstJournalLines = readJournal(handle, {
            paths,
            fromByte: 0,
            strategy: 'poll',
            pollIntervalMs: 0,
            signal: AbortSignal.timeout(READ_BACKSTOP_MS),
          })
          for await (const line of firstJournalLines) {
            all.push(line)
            if (all.length === 3) break
          }
          expect(all.map((l) => l.line)).toEqual([
            '{"a":1}',
            '{"b":2}',
            exitSentinelLine(paths, 0),
          ])

          const resumed = []
          const resumedJournalLines = readJournal(handle, {
            paths,
            fromByte: all[0]?.endPosition ?? 0,
            strategy: 'poll',
            pollIntervalMs: 0,
            signal: AbortSignal.timeout(READ_BACKSTOP_MS),
          })
          for await (const line of resumedJournalLines) {
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

    itFollows(
      config,
      'follows a journal that is still being written, delivering each line before the next is produced',
      async () => {
        expect.hasAssertions()
        const { handle, dispose } = await config.createHandle()
        const gate = noncePath('follow-gate')
        try {
          expectDeclaredStrategy(handle, config)
          const paths = journalPaths(`conf-follow-${Date.now()}`)
          const agentCommand =
            `printf '{"a":1}\\n'; ` +
            `i=0; while [ ! -f ${gate} ]; do ` +
            `i=$((i+1)); ` +
            `if [ $i -gt 30 ]; then printf '{"gate":"never"}\\n'; break; fi; ` +
            `sleep 1; done; ` +
            `printf '{"b":2}\\n'`
          void handle.process.spawn(journaledCommand(agentCommand, paths))
          await waitForJournal(handle, paths)
          expect(
            (await handle.process.exec(`test -e ${gate}`)).exitCode,
          ).not.toBe(0)
          const seen: Array<string> = []
          const followJournalLines = readJournal(handle, {
            paths,
            fromByte: 0,
            signal: AbortSignal.timeout(READ_BACKSTOP_MS),
          })
          for await (const line of followJournalLines) {
            seen.push(line.line)
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
            const stop = new AbortController()
            const backstop = AbortSignal.timeout(READ_BACKSTOP_MS)
            const abortJournalLines = readJournal(handle, {
              paths,
              fromByte: 0,
              signal: AbortSignal.any([stop.signal, backstop]),
            })
            for await (const line of abortJournalLines) {
              seen.push(line.line)
              // No `break`, ever: the pre-fix reader honored a consumer break but
              // rode straight past its signal, so a `break` here would pass it.
              stop.abort()
            }
            expect({ seen, backstopped: backstop.aborted }).toEqual({
              seen: ['{"a":1}'],
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
