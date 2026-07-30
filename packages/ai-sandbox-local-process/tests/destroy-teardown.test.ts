/**
 * Teardown must WAIT for the OS, not race it.
 *
 * `destroy()` used to `fsp.rm` the backing dir with no retries and without
 * touching the processes it had spawned. Every spawned command runs with that
 * dir as its CWD, and on Windows a directory that is a live process's CWD
 * cannot be removed — so the removal threw
 * `EBUSY: resource busy or locked, rmdir '…'`. Measured at a clean HEAD: 6-13
 * of 53 `ai-acp` tests lost per run, and one `ai-grok-build` test.
 *
 * POSIX `rmdir` tolerates open handles, so the EBUSY itself is Windows-only.
 * The behaviour asserted here is not: destroying a sandbox must terminate the
 * processes it owns and confirm they are gone, which is checkable everywhere.
 * The Windows-only case is called out where the platform is what makes the
 * assertion bite.
 */
import { afterAll, describe, expect, it } from 'vitest'
import { spawn } from 'node:child_process'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { localProcessSandbox } from '../src/index'
import { removeDirWithRetry } from '../src/handle'

const baseDir = path.join(
  os.tmpdir(),
  `tanstack-ai-lp-teardown-${Date.now()}-${process.pid}`,
)

afterAll(async () => {
  await fsp.rm(baseDir, {
    recursive: true,
    force: true,
    maxRetries: 20,
    retryDelay: 100,
  })
})

/** A captured warning kept WITH its `meta`, so a failure says WHY. */
interface CapturedWarning {
  message: string
  meta?: Record<string, unknown>
}

function capturingLogger(): {
  warnings: Array<CapturedWarning>
  warn: (message: string, meta?: Record<string, unknown>) => void
} {
  const warnings: Array<CapturedWarning> = []
  return {
    warnings,
    warn: (message, meta) => {
      warnings.push({ message, meta })
    },
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

const windowsOnly = process.platform === 'win32' ? it : it.skip

describe('destroy waits for the handle instead of racing it', () => {
  it('removes the dir while a spawned child still holds it as CWD', async () => {
    const logger = capturingLogger()
    // Only `baseDir` is set, so `dir` is undefined and `removeOnDestroy`
    // defaults to TRUE — the exact configuration `ai-acp` and
    // `ai-grok-build` use, and the one that was failing.
    const provider = localProcessSandbox({ baseDir, logger })
    const sbx = await provider.create({})
    const root = sbx.id

    // A child that will outlive the test unless teardown kills it. `node` on
    // purpose, not `sleep`: measured on Windows 11, a dir that is a live
    // `node`'s CWD cannot be removed (`EBUSY`, whether node is spawned
    // directly or under the `sh` wrapper), while MSYS `sleep`'s CWD does NOT
    // pin it. `sleep` would make this test vacuous.
    const proc = await sbx.process.spawn(
      `node -e "console.log('up'); setTimeout(() => {}, 30000)"`,
      { cwd: '/workspace' },
    )
    expect(proc.pid).toBeGreaterThan(0)
    // Wait for the grandchild to REALLY be up before tearing down. Without
    // this the `sh` wrapper is all that exists for the first ~200ms of node's
    // startup, the dir is not pinned yet, and the race this test exists to
    // pin down would not happen at all.
    let announced = false
    for await (const chunk of proc.stdout) {
      if (chunk.includes('up')) {
        announced = true
        break
      }
    }
    // Guard the guard: no announcement means nothing held the dir.
    expect(announced).toBe(true)
    expect(isAlive(proc.pid)).toBe(true)
    expect(await fsp.stat(root).then((s) => s.isDirectory())).toBe(true)

    // Before the fix this rejected with `EBUSY … rmdir` on Windows.
    await sbx.destroy()

    await expect(fsp.stat(root)).rejects.toThrow(/ENOENT/)
    expect(isAlive(proc.pid)).toBe(false)
    // Neither half of the fix fell back: no child outlived the wait, and the
    // dir did not stay busy. Asserting on NO warning at all would be a test
    // that passes by luck — `taskkill /T` intermittently reports
    // `Access is denied.` for a tree member that is concurrently exiting, and
    // `classifyTaskkillResult` scores that `failed` even though teardown
    // succeeded (measured: 1 run in ~6). That noise is killTree's, not this
    // path's, so it is tolerated here and the two warnings that WOULD mean
    // this fix failed are asserted absent instead.
    expect(
      logger.warnings.filter(
        (w) => /still busy/.test(w.message) || /still running/.test(w.message),
      ),
    ).toEqual([])
  }, 30_000)

  it('is a no-op on the dir when removeOnDestroy is false', async () => {
    const dir = path.join(baseDir, 'kept')
    await fsp.mkdir(dir, { recursive: true })
    const provider = localProcessSandbox({ dir })
    const sbx = await provider.create({})
    await sbx.destroy()
    expect(await fsp.stat(dir).then((s) => s.isDirectory())).toBe(true)
  })
})

describe('removeDirWithRetry', () => {
  it('resolves when the dir is already gone', async () => {
    const logger = capturingLogger()
    await removeDirWithRetry(path.join(baseDir, 'never-existed'), logger)
    expect(logger.warnings).toEqual([])
  })

  // A live process's CWD is what actually pins a dir on Windows — an open FILE
  // handle does not, because Node opens with `FILE_SHARE_DELETE`. Only Windows
  // enforces the CWD lock, so only there can the "never releases" branch be
  // driven; elsewhere the removal simply succeeds.
  windowsOnly(
    'reports a dir that never releases instead of throwing',
    async () => {
      const dir = path.join(baseDir, 'pinned')
      await fsp.mkdir(dir, { recursive: true })
      // A child whose CWD is `dir` and which we deliberately do NOT kill: the
      // residual case where no amount of retrying can win.
      const holder = spawn(
        process.execPath,
        ['-e', 'setTimeout(() => {}, 30000)'],
        {
          cwd: dir,
        },
      )
      const logger = capturingLogger()
      try {
        await new Promise((resolve) => setTimeout(resolve, 200))
        // Total by construction: a busy dir is logged, never thrown.
        await removeDirWithRetry(dir, logger)
        expect(logger.warnings).toHaveLength(1)
        expect(logger.warnings[0]?.message).toMatch(/still busy/)
        expect(logger.warnings[0]?.meta?.dir).toBe(dir)
      } finally {
        // Cleanup has to obey the very rule this test documents: wait for the
        // holder to REALLY exit (its `exit` event, not a hopeful sleep), then
        // retry the removal, because Windows releases the CWD handle a moment
        // after the process is gone. A bare `rm` here failed ~1 run in 4.
        const exited = new Promise((resolve) => holder.once('exit', resolve))
        holder.kill()
        await exited
        await fsp.rm(dir, {
          recursive: true,
          force: true,
          maxRetries: 20,
          retryDelay: 100,
        })
      }
    },
    30_000,
  )
})
