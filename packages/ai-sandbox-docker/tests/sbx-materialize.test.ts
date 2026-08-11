import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import { resolveHostRepo } from '../src/sbx/materialize'
import { defineWorkspace, gitSource, localSource } from '@tanstack/ai-sandbox'

const scratch: Array<string> = []

afterEach(async () => {
  await Promise.all(
    scratch.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

async function makeGitRepo(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'sbx-fix-'))
  scratch.push(dir)
  execFileSync('git', ['init'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 't@t.test'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 't'], { cwd: dir })
  await writeFile(path.join(dir, 'README.md'), 'hi\n')
  execFileSync('git', ['add', '.'], { cwd: dir })
  execFileSync('git', ['commit', '-m', 'init'], { cwd: dir })
  return dir
}

describe('resolveHostRepo', () => {
  it('uses workspaceDir when it contains .git', async () => {
    const repo = await makeGitRepo()
    const result = await resolveHostRepo({
      id: 'aabbccddeeff0011',
      workspaceDir: repo,
    })
    expect(result.hostDir).toBe(repo)
    expect(result.owned).toBe(false)
  })

  it('throws when workspaceDir has no .git', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'sbx-empty-'))
    scratch.push(dir)
    await expect(
      resolveHostRepo({ id: 'aabbccddeeff0011', workspaceDir: dir }),
    ).rejects.toThrow(/sbxSandbox needs a Git repository/)
  })

  it('uses a local source that is a Git repo', async () => {
    const repo = await makeGitRepo()
    const result = await resolveHostRepo({
      id: 'aabbccddeeff0011',
      workspace: defineWorkspace({ source: localSource(repo) }),
    })
    expect(result.hostDir).toBe(repo)
    expect(result.owned).toBe(false)
  })

  it('clones a git source into tmpdir/tanstack-sbx/<id> and marks it owned', async () => {
    const repo = await makeGitRepo()
    const id = 'aabbccddeeff0011'
    const result = await resolveHostRepo({
      id,
      workspace: defineWorkspace({
        source: gitSource({ url: repo }),
      }),
    })
    scratch.push(result.hostDir)
    expect(result.owned).toBe(true)
    expect(result.hostDir.replaceAll('\\', '/')).toMatch(
      /tanstack-sbx\/aabbccddeeff0011$/,
    )
    expect(await stat(path.join(result.hostDir, '.git'))).toBeTruthy()
  })

  it('throws when there is no git source and no workspaceDir', async () => {
    await expect(
      resolveHostRepo({
        id: 'aabbccddeeff0011',
        workspace: defineWorkspace({ source: { type: 'none' } }),
      }),
    ).rejects.toThrow(/sbxSandbox needs a Git repository/)
  })

  it('throws when workspace is missing', async () => {
    await expect(
      resolveHostRepo({ id: 'aabbccddeeff0011' }),
    ).rejects.toThrow(/sbxSandbox needs a Git repository/)
  })
})
