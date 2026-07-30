/**
 * Regression coverage for the `killTree` orphan leak.
 *
 * THE DEFECT. On Windows with a git-bash `sh`, a multi-statement command — e.g.
 * `journalFollowCommand`'s `mkdir -p …; : >> …; tail -c +1 -f …` — has its final
 * `tail` spawned by an intermediate `sh.exe` that MSYS's fork emulation then
 * exits. Windows never reparents, so `tail.exe`'s `ParentProcessId` keeps
 * pointing at that dead pid, and `taskkill /PID <sh> /T /F` — which walks only
 * LIVE parent links — never reaches it while still exiting `0`. Every follow read
 * leaked a `tail.exe` for the life of the machine (measured: 2 per run of the
 * journal conformance suite, 4 per run of the takeover suite).
 *
 * WHAT IS PORTABLE AND WHAT IS NOT. The attribution logic
 * (`parseMsysProcessTable` + `msysDescendantWinPids`) is pure text→pids and is
 * tested everywhere. The end-to-end proof is NOT portable and is Windows-gated:
 * it needs the MSYS process table, which exists only under git-bash, and the leak
 * itself is a Windows-only consequence of MSYS fork emulation. It is also
 * meaningless under Docker (that provider's `tail` dies with its container) and
 * on POSIX (`sh` really is `tail`'s parent, so signalling the wrapper suffices).
 * A host process census cannot be written once and trusted everywhere — so
 * rather than a test that passes everywhere for the wrong reason, the real
 * assertion self-skips off Windows and says why.
 */
import { afterAll, describe, expect, it } from 'vitest'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {
  classifyTaskkillResult,
  localProcessSandbox,
  msysDescendantWinPids,
  parseMsysProcessTable,
  taskkillPid,
} from '../src/index'

/** Real `ps` output captured from git-bash on Windows 11, trimmed to the shape that matters. */
const PS_FIXTURE = [
  '      PID    PPID    PGID     WINPID   TTY         UID    STIME COMMAND',
  '    37196       1   37196     106236  ?         197609 20:17:41 /usr/bin/sh',
  '    37198   37196   37196      95720  ?         197609 20:17:41 /usr/bin/tail',
  '    37217       1   37217      87848  ?         197609 20:17:42 /usr/bin/ps',
  '     2236       1    2236      53084  ?         197609 18:39:41 /c/Program Files/nodejs/node',
  '',
].join('\n')

describe('parseMsysProcessTable', () => {
  it('reads pid/ppid/winpid and skips the header and blank lines', () => {
    expect(parseMsysProcessTable(PS_FIXTURE)).toEqual([
      { pid: 37196, ppid: 1, winpid: 106236 },
      { pid: 37198, ppid: 37196, winpid: 95720 },
      { pid: 37217, ppid: 1, winpid: 87848 },
      { pid: 2236, ppid: 1, winpid: 53084 },
    ])
  })

  it('drops `ps -W` native rows, whose ppid column is 0', () => {
    // `-W` appends every native Windows process with a PPID/PGID of 0. They are
    // in no MSYS tree, so they must never widen the sweep.
    const withNative = `${PS_FIXTURE}\n   118284       0       0      52748  ?              0 18:39:42 C:\\Program Files\\Git\\bin\\sh.exe`
    expect(parseMsysProcessTable(withNative)).toHaveLength(4)
  })
})

describe('msysDescendantWinPids', () => {
  it('finds the grandchild whose Windows parent link is broken', () => {
    // 95720's Windows ParentProcessId points at an exited intermediate, so
    // `taskkill /T` cannot reach it — MSYS's table is the only place the link
    // back to our `sh` (winpid 106236) survives.
    expect(
      msysDescendantWinPids(parseMsysProcessTable(PS_FIXTURE), 106236),
    ).toEqual([95720])
  })

  it('excludes the root itself', () => {
    const rows = parseMsysProcessTable(PS_FIXTURE)
    expect(msysDescendantWinPids(rows, 106236)).not.toContain(106236)
  })

  it('returns nothing when the root is not an MSYS process', () => {
    // Nothing to sweep beyond what `taskkill /T` already covered.
    expect(
      msysDescendantWinPids(parseMsysProcessTable(PS_FIXTURE), 999999),
    ).toEqual([])
  })

  it('terminates on a ppid cycle instead of hanging', () => {
    const rows = [
      { pid: 10, ppid: 1, winpid: 100 },
      { pid: 11, ppid: 10, winpid: 101 },
      { pid: 12, ppid: 11, winpid: 102 },
      { pid: 10, ppid: 12, winpid: 100 },
    ]
    expect(msysDescendantWinPids(rows, 100).sort()).toEqual([101, 102])
  })
})

describe('classifyTaskkillResult', () => {
  it('treats exit 0 as killed', () => {
    expect(classifyTaskkillResult(0, '')).toBe('killed')
  })

  it('treats 128 / "not found" as already-exited, not a failure', () => {
    // The single most common teardown case: the process finished on its own
    // before we asked. Calling it a failure would make every clean teardown log
    // an error and retry a kill that has nothing to kill.
    expect(classifyTaskkillResult(128, '')).toBe('already-exited')
    expect(
      classifyTaskkillResult(1, 'ERROR: The process "1234" not found.\r\n'),
    ).toBe('already-exited')
    expect(
      classifyTaskkillResult(1, 'ERROR: The process "1234" does not exist.'),
    ).toBe('already-exited')
  })

  it('treats /T\'s "no running instance of the task" as already-exited', () => {
    // The wording `/T` uses when a tree member exits between taskkill
    // enumerating it and signalling it. It comes back with status 1 and matches
    // NEITHER "not found" nor "does not exist", so it used to be classified
    // `failed` — logging a warning on an ordinary teardown race. That is the
    // known suspect for the intermittent single-warning failure of "a normal
    // kill neither throws nor reports a failure" below.
    expect(
      classifyTaskkillResult(
        1,
        'ERROR: The process with PID 1234 (child process of PID 5678) could not be terminated.\r\nReason: There is no running instance of the task.\r\n',
      ),
    ).toBe('already-exited')
  })

  it('treats any other nonzero status as a real failure', () => {
    // A launched taskkill is not a successful taskkill — `spawnSync` reporting
    // no `error` says only that the binary ran.
    expect(classifyTaskkillResult(1, 'ERROR: Access is denied.\r\n')).toBe(
      'failed',
    )
    expect(classifyTaskkillResult(null, '')).toBe('failed')
  })

  it('keeps a genuine refusal a failure even though it shares /T\'s "could not be terminated" prefix', () => {
    // The widening above must not swallow these: the process is still running
    // and the caller has leaked it. Both are verbatim taskkill output (captured
    // against pid 4 and pid 0 respectively on Windows 11).
    expect(
      classifyTaskkillResult(
        1,
        'ERROR: The process with PID 4 could not be terminated.\r\nReason: Access is denied.\r\r\n',
      ),
    ).toBe('failed')
    expect(
      classifyTaskkillResult(
        1,
        'ERROR: The process with PID 0 could not be terminated.\r\nReason: This is critical system process. Taskkill cannot end this process.\r\n',
      ),
    ).toBe('failed')
  })
})

const baseDir = path.join(os.tmpdir(), `tanstack-ai-lp-kt-${Date.now()}`)
const provider = localProcessSandbox({ baseDir, removeOnDestroy: true })

afterAll(async () => {
  await fsp.rm(baseDir, { recursive: true, force: true })
})

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

// See the module doc: a host process census is not portable, so the end-to-end
// proof is Windows-only rather than a test that passes everywhere vacuously.
const windowsOnly = process.platform === 'win32' ? it : it.skip

describe('killTree leaves no orphaned descendants (Windows/MSYS)', () => {
  windowsOnly(
    'kills the `tail` that `taskkill /T` cannot reach',
    async () => {
      const sbx = await provider.create({})
      await sbx.fs.write('/workspace/j.ndjson', 'line1\n')
      // The exact shape of `journalFollowCommand`: a statement list whose last
      // command MSYS runs under an intermediate shell that then exits.
      const proc = await sbx.process.spawn(
        `mkdir -p '/tmp/tanstack-kt' 2>/dev/null; : >> 'j.ndjson' 2>/dev/null; tail -c +1 -f 'j.ndjson' 2>/dev/null`,
        { cwd: '/workspace' },
      )
      // Wait for real output so `tail` is definitely up before we look for it.
      for await (const chunk of proc.stdout) {
        if (chunk.includes('line1')) break
      }

      const table = parseMsysProcessTable(
        (await sbx.process.exec('ps', { cwd: '/workspace' })).stdout,
      )
      const descendants = msysDescendantWinPids(table, proc.pid)
      // Guard the guard: if this is empty the assertion below is vacuous.
      expect(descendants.length).toBeGreaterThan(0)

      await proc.kill()
      // Windows process teardown is not instantaneous.
      await new Promise((resolve) => setTimeout(resolve, 500))

      expect(descendants.filter((pid) => isAlive(pid))).toEqual([])
      await sbx.destroy()
    },
    30_000,
  )
})

/**
 * A captured warning, kept WITH its `meta`.
 *
 * Capturing only `message` is what made this suite's one intermittent failure
 * undiagnosable: it printed
 * `expected [ "local-process: taskkill failed to kill a process" ] to deeply
 * equal []` and threw away the `status`/`stderr` that says WHICH taskkill
 * wording was misclassified. `taskkillPid` already logs the raw stderr in
 * `meta`; asserting on the full record is what puts it in the failure output.
 */
interface CapturedWarning {
  message: string
  meta?: Record<string, unknown>
}

describe('killTree teardown is total by construction', () => {
  it('a normal kill neither throws nor reports a failure', async () => {
    // Teardown paths on this branch (`SpawnHandle.kill`, `signal` abort
    // handlers, `pipeToRunLog`) are deliberately unable to fail: a throwing kill
    // would wedge a run at 'running' with its tailers parked, and treating the
    // ordinary "it already exited" case as an error would cry wolf on every
    // clean teardown. Both are asserted here rather than left to review.
    const warnings: Array<CapturedWarning> = []
    const noisy = localProcessSandbox({
      baseDir,
      removeOnDestroy: true,
      logger: { warn: (message, meta) => warnings.push({ message, meta }) },
    })
    const sbx = await noisy.create({})

    // Kill a live process...
    const live = await sbx.process.spawn('sleep 30')
    await expect(live.kill()).resolves.toBeUndefined()

    // ...and one that has already exited on its own.
    const done = await sbx.process.spawn('exit 0')
    await done.wait()
    await expect(done.kill()).resolves.toBeUndefined()

    // Asserting the whole record (not just `message`) so a future intermittent
    // failure prints the raw taskkill status + stderr and is diagnosable on the
    // first occurrence. Do NOT relax this to "warnings are allowed" — the
    // warning firing here IS the signal that a benign wording is misclassified.
    expect(warnings).toEqual([])
    await sbx.destroy()
  }, 30_000)

  // Counterpart to the assertion above: it is only meaningful if a warning CAN
  // fire. Windows-only because the warning is emitted by the `taskkill` branch,
  // which `killTree` never reaches on POSIX.
  windowsOnly(
    'reports a genuine refusal as a failure, with the raw taskkill stderr attached',
    () => {
      const warnings: Array<CapturedWarning> = []
      // pid 0 is the System Idle Process: taskkill always refuses it ("This is
      // critical system process"), so this is a real, reproducible refusal that
      // cannot harm the machine — nothing is signalled and no real process is
      // targeted. `tree: false` so taskkill never walks a live tree.
      const gone = taskkillPid(0, false, {
        warn: (message, meta) => warnings.push({ message, meta }),
      })

      expect(gone).toBe(false)
      expect(warnings).toHaveLength(1)
      expect(warnings[0]?.message).toBe(
        'local-process: taskkill failed to kill a process',
      )
      // The raw stderr must reach the log — that is what makes an intermittent
      // misclassification diagnosable instead of a mystery.
      expect(warnings[0]?.meta).toMatchObject({ pid: 0, status: 1 })
      expect(String(warnings[0]?.meta?.stderr)).toContain(
        'could not be terminated',
      )
    },
    30_000,
  )
})
