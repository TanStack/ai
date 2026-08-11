import { access, mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineWorkspace, gitSource, localSource } from '@tanstack/ai-sandbox'
import type { ExecFileException, ExecFileOptions } from 'node:child_process'

interface CloneExecCall {
  file: string
  args: ReadonlyArray<string>
  env: NodeJS.ProcessEnv | undefined
}

const { cloneExec } = vi.hoisted(() => ({
  cloneExec: {
    intercept: false,
    probeThrow: false,
    calls: [] as Array<CloneExecCall>,
  },
}))

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return {
    ...actual,
    execFile: (
      file: string,
      args: ReadonlyArray<string> | undefined | null,
      options: ExecFileOptions | undefined | null,
      callback?: (
        error: ExecFileException | null,
        stdout: string | Buffer,
        stderr: string | Buffer,
      ) => void,
    ) => {
      const verb = (args ?? [])[0]
      if (
        cloneExec.probeThrow &&
        file === 'git' &&
        (verb === 'remote' || verb === 'rev-parse')
      ) {
        const error: ExecFileException = Object.assign(
          new Error('git probe failed'),
          { code: 'EFAIL' },
        )
        callback?.(error, '', 'git probe failed')
        return
      }
      if (
        cloneExec.intercept &&
        file === 'git' &&
        (verb === 'clone' || verb === 'fetch' || verb === 'checkout')
      ) {
        cloneExec.calls.push({
          file,
          args: args ?? [],
          env: options?.env,
        })
        callback?.(null, '', '')
        return
      }
      return actual.execFile(file, args ?? [], options ?? {}, callback)
    },
  }
})

const { ownedHostRepoDir, resolveHostRepo, sandboxNameFromId } =
  await import('../src/sbx/materialize')

const scratch: Array<string> = []

afterEach(async () => {
  cloneExec.probeThrow = false
  await Promise.all(
    scratch.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

async function initGitRepo(dir: string): Promise<void> {
  execFileSync('git', ['init'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 't@t.test'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 't'], { cwd: dir })
  await writeFile(path.join(dir, 'README.md'), 'hi\n')
  execFileSync('git', ['add', '.'], { cwd: dir })
  execFileSync('git', ['commit', '-m', 'init'], { cwd: dir })
}

async function makeGitRepo(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'sbx-fix-'))
  scratch.push(dir)
  await initGitRepo(dir)
  return dir
}

describe('sandboxNameFromId / ownedHostRepoDir', () => {
  it('rejects a path-traversal id and does not leave tanstack-sbx', () => {
    const root = path.resolve(path.join(tmpdir(), 'tanstack-sbx'))
    expect(() => ownedHostRepoDir('..\\..\\Windows')).toThrow(/sandbox id/)
    expect(() => ownedHostRepoDir('../../etc')).toThrow(/sandbox id/)
    expect(() => ownedHostRepoDir('..')).toThrow(/sandbox id/)
    expect(() => ownedHostRepoDir('.')).toThrow(/sandbox id/)
    expect(() => ownedHostRepoDir('')).toThrow(/sandbox id/)
    expect(() => ownedHostRepoDir('foo/bar')).toThrow(/sandbox id/)
    expect(() => ownedHostRepoDir('foo\\bar')).toThrow(/sandbox id/)
    expect(() => sandboxNameFromId('..\\..\\Windows')).toThrow(/sandbox id/)
    expect(() => sandboxNameFromId('../../etc')).toThrow(/sandbox id/)
    const dest = ownedHostRepoDir('aabbccddeeff0011')
    const resolved = path.resolve(dest)
    expect(resolved === root || resolved.startsWith(root + path.sep)).toBe(true)
    expect(path.basename(dest)).toBe('aabbccddeeff0011')
    expect(sandboxNameFromId('deadbeef-dead-beef-dead-beefdeadbeef')).toBe(
      'deadbeef-dead-beef-dead-beefdeadbeef',
    )
  })
})

describe('resolveHostRepo', { timeout: 30_000 }, () => {
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

  it('local source path is resolved against process cwd', async () => {
    const relativePath = 'rel-repo'
    const absRepo = path.resolve(relativePath)
    await mkdir(absRepo)
    scratch.push(absRepo)
    await initGitRepo(absRepo)

    const result = await resolveHostRepo({
      id: 'aabbccddeeff0011',
      workspace: defineWorkspace({ source: localSource(relativePath) }),
    })
    expect(result.hostDir).toBe(absRepo)
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

  it('rejects a path-traversal id and does not clone outside tanstack-sbx', async () => {
    const repo = await makeGitRepo()
    const probeName = `sbx-a3-probe-${Date.now()}`
    const id = `..${path.sep}${probeName}`
    const escaped = path.resolve(path.join(tmpdir(), 'tanstack-sbx', id))
    scratch.push(escaped)
    await expect(
      resolveHostRepo({
        id,
        workspace: defineWorkspace({
          source: gitSource({ url: repo }),
        }),
      }),
    ).rejects.toThrow(/sandbox id/)
    await expect(access(escaped)).rejects.toMatchObject({ code: 'ENOENT' })
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
    await expect(resolveHostRepo({ id: 'aabbccddeeff0011' })).rejects.toThrow(
      /sbxSandbox needs a Git repository/,
    )
  })

  it('reclones a no-ref source even when origin matches on the second call', async () => {
    const repo = await makeGitRepo()
    const id = 'retry000000000001'
    const workspace = defineWorkspace({
      source: gitSource({ url: repo }),
    })
    const first = await resolveHostRepo({ id, workspace })
    scratch.push(first.hostDir)
    expect(first.owned).toBe(true)
    expect(await stat(path.join(first.hostDir, '.git'))).toBeTruthy()
    await writeFile(path.join(first.hostDir, 'local-only.txt'), 'gone\n')

    const second = await resolveHostRepo({ id, workspace })
    expect(second.hostDir).toBe(first.hostDir)
    expect(second.owned).toBe(true)
    expect(await stat(path.join(second.hostDir, '.git'))).toBeTruthy()
    await expect(
      stat(path.join(second.hostDir, 'local-only.txt')),
    ).rejects.toThrow()
  })

  it('replaces a non-git leftover at the owned dest then clones', async () => {
    const repo = await makeGitRepo()
    const id = 'retry000000000002'
    const dest = path.join(tmpdir(), 'tanstack-sbx', id)
    await mkdir(dest, { recursive: true })
    await writeFile(path.join(dest, 'leftover.txt'), 'stale\n')
    scratch.push(dest)

    const result = await resolveHostRepo({
      id,
      workspace: defineWorkspace({
        source: gitSource({ url: repo }),
      }),
    })
    expect(result.hostDir).toBe(dest)
    expect(result.owned).toBe(true)
    expect(await stat(path.join(result.hostDir, '.git'))).toBeTruthy()
  })

  it('reclone the owned dest when the git url does not match', async () => {
    const repoA = await makeGitRepo()
    await writeFile(path.join(repoA, 'from-a.txt'), 'a\n')
    execFileSync('git', ['add', '.'], { cwd: repoA })
    execFileSync('git', ['commit', '-m', 'a'], { cwd: repoA })

    const repoB = await makeGitRepo()
    await writeFile(path.join(repoB, 'from-b.txt'), 'b\n')
    execFileSync('git', ['add', '.'], { cwd: repoB })
    execFileSync('git', ['commit', '-m', 'b'], { cwd: repoB })

    const id = 'retry000000000003'
    const dest = path.join(tmpdir(), 'tanstack-sbx', id)
    await mkdir(path.dirname(dest), { recursive: true })
    execFileSync('git', ['clone', '--', repoA, dest])
    scratch.push(dest)

    const result = await resolveHostRepo({
      id,
      workspace: defineWorkspace({
        source: gitSource({ url: repoB }),
      }),
    })
    expect(result.hostDir).toBe(dest)
    expect(result.owned).toBe(true)
    expect(await stat(path.join(result.hostDir, 'from-b.txt'))).toBeTruthy()
    await expect(
      stat(path.join(result.hostDir, 'from-a.txt')),
    ).rejects.toThrow()
  })

  it('reuses the owned dest when url and branch both match', async () => {
    const repo = await makeGitRepo()
    execFileSync('git', ['branch', 'feature'], { cwd: repo })
    const id = 'retry000000000004'
    const workspace = defineWorkspace({
      source: gitSource({ url: repo, ref: 'feature' }),
    })
    const first = await resolveHostRepo({ id, workspace })
    scratch.push(first.hostDir)
    await writeFile(path.join(first.hostDir, 'local-only.txt'), 'keep\n')

    const second = await resolveHostRepo({ id, workspace })
    expect(second.hostDir).toBe(first.hostDir)
    expect(second.owned).toBe(true)
    expect(await stat(path.join(second.hostDir, 'local-only.txt'))).toBeTruthy()
  })

  it('reclones the owned dest when leftover git has no origin remote', async () => {
    const repo = await makeGitRepo()
    await writeFile(path.join(repo, 'marker.txt'), 'ok\n')
    execFileSync('git', ['add', '.'], { cwd: repo })
    execFileSync('git', ['commit', '-m', 'marker'], { cwd: repo })

    const id = 'retry000000000005'
    const dest = path.join(tmpdir(), 'tanstack-sbx', id)
    await mkdir(dest, { recursive: true })
    scratch.push(dest)
    await initGitRepo(dest)

    const result = await resolveHostRepo({
      id,
      workspace: defineWorkspace({
        source: gitSource({ url: repo }),
      }),
    })
    expect(result.hostDir).toBe(dest)
    expect(result.owned).toBe(true)
    expect(await stat(path.join(result.hostDir, 'marker.txt'))).toBeTruthy()
  })

  it('reclones the owned dest when leftover git dir is incomplete', async () => {
    const repo = await makeGitRepo()
    await writeFile(path.join(repo, 'marker.txt'), 'ok\n')
    execFileSync('git', ['add', '.'], { cwd: repo })
    execFileSync('git', ['commit', '-m', 'marker'], { cwd: repo })

    const id = 'retry000000000006'
    const dest = path.join(tmpdir(), 'tanstack-sbx', id)
    await mkdir(path.join(dest, '.git'), { recursive: true })
    scratch.push(dest)

    const result = await resolveHostRepo({
      id,
      workspace: defineWorkspace({
        source: gitSource({ url: repo }),
      }),
    })
    expect(result.hostDir).toBe(dest)
    expect(result.owned).toBe(true)
    expect(await stat(path.join(result.hostDir, 'marker.txt'))).toBeTruthy()
  })

  it('reclones when the branch does not match', async () => {
    const repo = await makeGitRepo()
    await writeFile(path.join(repo, 'on-default.txt'), 'd\n')
    execFileSync('git', ['add', '.'], { cwd: repo })
    execFileSync('git', ['commit', '-m', 'default'], { cwd: repo })
    execFileSync('git', ['checkout', '-b', 'other'], { cwd: repo })
    await writeFile(path.join(repo, 'on-other.txt'), 'o\n')
    execFileSync('git', ['add', '.'], { cwd: repo })
    execFileSync('git', ['commit', '-m', 'other'], { cwd: repo })
    execFileSync('git', ['checkout', '-'], { cwd: repo })

    const id = 'retry000000000007'
    const dest = path.join(tmpdir(), 'tanstack-sbx', id)
    await mkdir(path.dirname(dest), { recursive: true })
    execFileSync('git', ['clone', '--', repo, dest])
    scratch.push(dest)

    const result = await resolveHostRepo({
      id,
      workspace: defineWorkspace({
        source: gitSource({ url: repo, ref: 'other' }),
      }),
    })
    expect(result.hostDir).toBe(dest)
    expect(result.owned).toBe(true)
    expect(await stat(path.join(result.hostDir, 'on-other.txt'))).toBeTruthy()
  })

  it('reuses when an annotated tag matches HEAD', async () => {
    const repo = await makeGitRepo()
    execFileSync('git', ['tag', '-a', 'v1.0.0', '-m', 'release'], { cwd: repo })
    const id = 'retry000000000010'
    const workspace = defineWorkspace({
      source: gitSource({ url: repo, ref: 'v1.0.0' }),
    })
    const first = await resolveHostRepo({ id, workspace })
    scratch.push(first.hostDir)
    await writeFile(path.join(first.hostDir, 'dirty.txt'), 'keep\n')

    const second = await resolveHostRepo({ id, workspace })
    expect(second.hostDir).toBe(first.hostDir)
    expect(second.owned).toBe(true)
    expect(await stat(path.join(second.hostDir, 'dirty.txt'))).toBeTruthy()
  })

  it('no-ref does not reuse any matching origin', async () => {
    const repo = await makeGitRepo()
    execFileSync('git', ['checkout', '-b', 'other'], { cwd: repo })
    await writeFile(path.join(repo, 'on-other.txt'), 'o\n')
    execFileSync('git', ['add', '.'], { cwd: repo })
    execFileSync('git', ['commit', '-m', 'other'], { cwd: repo })
    execFileSync('git', ['checkout', '-'], { cwd: repo })

    const id = 'retry000000000011'
    const dest = path.join(tmpdir(), 'tanstack-sbx', id)
    await mkdir(path.dirname(dest), { recursive: true })
    execFileSync('git', ['clone', '--branch', 'other', '--', repo, dest])
    scratch.push(dest)
    await writeFile(path.join(dest, 'local-only.txt'), 'gone\n')

    const result = await resolveHostRepo({
      id,
      workspace: defineWorkspace({
        source: gitSource({ url: repo }),
      }),
    })
    expect(result.hostDir).toBe(dest)
    expect(result.owned).toBe(true)
    expect(await stat(path.join(result.hostDir, '.git'))).toBeTruthy()
    await expect(
      stat(path.join(result.hostDir, 'local-only.txt')),
    ).rejects.toThrow()
  })

  it('probe throw does not rm -rf the dest', async () => {
    const repo = await makeGitRepo()
    const id = 'retry000000000008'
    const dest = path.join(tmpdir(), 'tanstack-sbx', id)
    await mkdir(path.dirname(dest), { recursive: true })
    execFileSync('git', ['clone', '--', repo, dest])
    scratch.push(dest)
    const localOnly = path.join(dest, 'local-only.txt')
    await writeFile(localOnly, 'keep\n')

    cloneExec.probeThrow = true
    await expect(
      resolveHostRepo({
        id,
        workspace: defineWorkspace({
          source: gitSource({ url: repo }),
        }),
      }),
    ).rejects.toThrow(/git probe failed/)
    cloneExec.probeThrow = false

    expect(await stat(dest)).toBeTruthy()
    expect(await stat(localOnly)).toBeTruthy()
  })

  it('still reclones when origin url really does not match', async () => {
    const repoA = await makeGitRepo()
    await writeFile(path.join(repoA, 'from-a.txt'), 'a\n')
    execFileSync('git', ['add', '.'], { cwd: repoA })
    execFileSync('git', ['commit', '-m', 'a'], { cwd: repoA })

    const repoB = await makeGitRepo()
    await writeFile(path.join(repoB, 'from-b.txt'), 'b\n')
    execFileSync('git', ['add', '.'], { cwd: repoB })
    execFileSync('git', ['commit', '-m', 'b'], { cwd: repoB })

    const id = 'retry000000000009'
    const dest = path.join(tmpdir(), 'tanstack-sbx', id)
    await mkdir(path.dirname(dest), { recursive: true })
    execFileSync('git', ['clone', '--', repoA, dest])
    scratch.push(dest)
    await writeFile(path.join(dest, 'local-only.txt'), 'gone\n')

    const result = await resolveHostRepo({
      id,
      workspace: defineWorkspace({
        source: gitSource({ url: repoB }),
      }),
    })
    expect(result.hostDir).toBe(dest)
    expect(result.owned).toBe(true)
    expect(await stat(path.join(result.hostDir, 'from-b.txt'))).toBeTruthy()
    await expect(
      stat(path.join(result.hostDir, 'from-a.txt')),
    ).rejects.toThrow()
    await expect(
      stat(path.join(result.hostDir, 'local-only.txt')),
    ).rejects.toThrow()
  })
})

describe('cloneGitSource auth and depth', () => {
  beforeEach(() => {
    cloneExec.intercept = true
    cloneExec.calls.length = 0
  })

  afterEach(() => {
    cloneExec.intercept = false
    cloneExec.calls.length = 0
  })

  async function cloneWithAuth(
    token = 'super-secret-token',
    id = 'auth00000000000001',
  ): Promise<CloneExecCall> {
    const dest = path.join(tmpdir(), 'tanstack-sbx', id)
    scratch.push(dest)

    await resolveHostRepo({
      id,
      workspace: defineWorkspace({
        source: gitSource({
          url: 'https://github.com/org/repo.git',
          auth: { username: 'x-access-token', token },
        }),
      }),
    })

    expect(cloneExec.calls).toHaveLength(1)
    const call = cloneExec.calls[0]
    if (call === undefined) {
      throw new Error('expected clone exec call')
    }
    return call
  }

  it('clone keeps the auth token in env vars, not in GIT_CONFIG_VALUE_0', async () => {
    const token = 'super-secret-token'
    const call = await cloneWithAuth(token)
    const env = call.env
    expect(env).toBeDefined()
    if (env === undefined) {
      throw new Error('expected clone env')
    }
    expect(env.GIT_ASKPASS_USER).toBe('x-access-token')
    expect(env.GIT_ASKPASS_TOKEN).toBe(token)
    expect(env.GIT_CONFIG_VALUE_0).toBeDefined()
    expect(env.GIT_CONFIG_VALUE_0).not.toContain(token)
    expect(env.GIT_CONFIG_VALUE_0).toContain('${GIT_ASKPASS_TOKEN}')
    expect(env.GIT_CONFIG_VALUE_0).toContain('${GIT_ASKPASS_USER}')
  })

  it('clone keeps the auth token in GIT_ASKPASS_* only', async () => {
    const token = 'super-secret-token'
    const call = await cloneWithAuth(token, 'auth00000000000002')
    const env = call.env
    expect(env).toBeDefined()
    if (env === undefined) {
      throw new Error('expected clone env')
    }
    expect(env.GIT_ASKPASS_USER).toBe('x-access-token')
    expect(env.GIT_ASKPASS_TOKEN).toBe(token)
    expect(call.args.join(' ')).not.toContain(token)
    expect(env.GIT_CONFIG_VALUE_0).not.toContain(token)
  })

  it('does not set GIT_ASKPASS to echo', async () => {
    const call = await cloneWithAuth('super-secret-token', 'auth00000000000003')
    const env = call.env
    expect(env).toBeDefined()
    if (env === undefined) {
      throw new Error('expected clone env')
    }
    expect(env.GIT_ASKPASS).not.toBe('echo')
  })

  it('quotes the credential helper like git-exec', async () => {
    const call = await cloneWithAuth('super-secret-token', 'auth00000000000004')
    const env = call.env
    expect(env).toBeDefined()
    if (env === undefined) {
      throw new Error('expected clone env')
    }
    expect(env.GIT_CONFIG_VALUE_0).toBe(
      '!f() { echo "username=${GIT_ASKPASS_USER}"; echo "password=${GIT_ASKPASS_TOKEN}"; }; f',
    )
  })

  it('clones a SHA without --branch', async () => {
    const sha = '0123456789abcdef0123456789abcdef01234567'
    const id = 'sha000000000000001'
    scratch.push(path.join(tmpdir(), 'tanstack-sbx', id))

    await resolveHostRepo({
      id,
      workspace: defineWorkspace({
        source: gitSource({
          url: 'https://github.com/org/repo.git',
          ref: sha,
        }),
      }),
    })

    const cloneCall = cloneExec.calls.find((call) => call.args[0] === 'clone')
    expect(cloneCall).toBeDefined()
    if (cloneCall === undefined) {
      throw new Error('expected clone exec call')
    }
    expect(cloneCall.args).not.toContain('--branch')
    expect(cloneCall.args).not.toContain(sha)

    const fetchCall = cloneExec.calls.find((call) => call.args[0] === 'fetch')
    expect(fetchCall).toBeDefined()
    if (fetchCall === undefined) {
      throw new Error('expected fetch exec call')
    }
    expect(fetchCall.args).toContain(sha)

    const checkoutCall = cloneExec.calls.find(
      (call) => call.args[0] === 'checkout',
    )
    expect(checkoutCall).toBeDefined()
    if (checkoutCall === undefined) {
      throw new Error('expected checkout exec call')
    }
    expect(checkoutCall.args).toContain(sha)
  })

  it('clone rejects a bad depth before git runs', async () => {
    const idZero = 'depth0000000000001'
    const idInject = 'depth0000000000002'
    scratch.push(path.join(tmpdir(), 'tanstack-sbx', idZero))
    scratch.push(path.join(tmpdir(), 'tanstack-sbx', idInject))

    await expect(
      resolveHostRepo({
        id: idZero,
        workspace: defineWorkspace({
          source: gitSource({
            url: 'https://github.com/org/repo.git',
            depth: 0,
          }),
        }),
      }),
    ).rejects.toThrow(/positive integer/)
    await expect(
      resolveHostRepo({
        id: idInject,
        workspace: defineWorkspace({
          source: gitSource({
            url: 'https://github.com/org/repo.git',
            depth: '1; rm -rf /' as never,
          }),
        }),
      }),
    ).rejects.toThrow(/positive integer/)
    expect(cloneExec.calls).toHaveLength(0)
  })
})
