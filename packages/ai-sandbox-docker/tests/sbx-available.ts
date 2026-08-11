/**
 * The sbx matrix's availability gate.
 *
 * NO CLI / NO LOGIN IS A NAMED SKIP, never a silent pass. `sbx ls --json` is
 * the probe: it needs `sbx` on PATH and a login. The testkit / `describe.skipIf`
 * then shows the reason, so a laptop without Docker Sandboxes is not mistaken
 * for coverage.
 */
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { runSbx } from '../src/sbx/cli'

export type SbxGate =
  | Record<string, never>
  | { unsupported: { reason: string } }

export async function sbxGate(suite: string): Promise<SbxGate> {
  try {
    await runSbx(['ls', '--json'])
    return {}
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return { unsupported: { reason: `${suite}: sbx not usable (${reason})` } }
  }
}

/** 16 hex chars — a valid `sbx create --name`. */
export function sbxTestId(): string {
  return randomBytes(8).toString('hex')
}

/** Host Git repo for `sbx create --clone`. Caller deletes the dir. */
export async function makeSbxFixtureRepo(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'sbx-live-'))
  execFileSync('git', ['init'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 't@t.test'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 't'], { cwd: dir })
  await writeFile(path.join(dir, 'README.md'), 'live\n')
  execFileSync('git', ['add', '.'], { cwd: dir })
  execFileSync('git', ['commit', '-m', 'init'], { cwd: dir })
  return dir
}
