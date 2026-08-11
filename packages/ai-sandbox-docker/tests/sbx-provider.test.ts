import { access, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import { SbxHandle, SBX_CAPS } from '../src/sbx/handle'
import { sbxSandbox } from '../src/sbx/provider'
import type { SbxRunResult, SbxSpawn } from '../src/sbx/cli'
import {
  defineSandboxPolicy,
  defineWorkspace,
  gitSource,
} from '@tanstack/ai-sandbox'
import { dockerSandbox, sbxSandbox as sbxSandboxFromBarrel } from '../src/index'

function scriptedSpawn(
  scripts: Array<{
    match: (args: Array<string>) => boolean
    result: SbxRunResult
  }>,
): { spawn: SbxSpawn; calls: Array<Array<string>> } {
  const calls: Array<Array<string>> = []
  const spawn: SbxSpawn = (_bin, args, opts) => {
    calls.push(args)
    const hit = scripts.find((s) => s.match(args))
    const result = hit?.result ?? {
      stdout: '',
      stderr: `unexpected sbx ${args.join(' ')}`,
      exitCode: 1,
    }
    queueMicrotask(() => opts.onClose(result))
    return { kill: () => {} }
  }
  return { spawn, calls }
}

describe('SbxHandle', () => {
  it('exec runs sbx exec <name> -- sh -c <cmd>', async () => {
    const { spawn, calls } = scriptedSpawn([
      {
        match: (args) => args[0] === 'exec' && args.includes('echo hi'),
        result: { stdout: 'hi\n', stderr: '', exitCode: 0 },
      },
    ])
    const handle = new SbxHandle({
      name: 'deadbeefdeadbeef',
      workspaceRoot: '/home/user/work',
      binary: 'sbx',
      spawn,
    })
    const result = await handle.process.exec('echo hi')
    expect(result.stdout.trim()).toBe('hi')
    expect(result.exitCode).toBe(0)
    expect(calls[0]).toEqual([
      'exec',
      '-w',
      '/home/user/work',
      '--',
      'deadbeefdeadbeef',
      'sh',
      '-c',
      'echo hi',
    ])
  })

  it('env.set is forwarded as -e on the next exec', async () => {
    const { spawn, calls } = scriptedSpawn([
      {
        match: (args) => args[0] === 'exec',
        result: { stdout: '', stderr: '', exitCode: 0 },
      },
    ])
    const handle = new SbxHandle({
      name: 'deadbeefdeadbeef',
      workspaceRoot: '/home/user/work',
      binary: 'sbx',
      spawn,
    })
    await handle.env.set({ XAI_API_KEY: 'secret' })
    await handle.process.exec('true')
    const args = calls[0] ?? []
    const eIndex = args.indexOf('-e')
    expect(eIndex).toBeGreaterThan(-1)
    expect(args[eIndex + 1]).toBe('XAI_API_KEY=secret')
  })

  it('ports.connect publishes then reads host port from sbx ports --json', async () => {
    const { spawn } = scriptedSpawn([
      {
        match: (args) => args[0] === 'ports' && args.includes('--publish'),
        result: { stdout: '', stderr: '', exitCode: 0 },
      },
      {
        match: (args) => args[0] === 'ports' && args.includes('--json'),
        result: {
          stdout: JSON.stringify({ '3000': 41_000 }),
          stderr: '',
          exitCode: 0,
        },
      },
    ])
    const handle = new SbxHandle({
      name: 'deadbeefdeadbeef',
      workspaceRoot: '/home/user/work',
      binary: 'sbx',
      spawn,
    })
    const channel = await handle.ports.connect(3000)
    expect(channel.url).toBe('http://localhost:41000')
  })

  it('destroy runs sbx rm --force', async () => {
    const { spawn, calls } = scriptedSpawn([
      {
        match: (args) => args[0] === 'rm',
        result: { stdout: '', stderr: '', exitCode: 0 },
      },
    ])
    const handle = new SbxHandle({
      name: 'deadbeefdeadbeef',
      workspaceRoot: '/home/user/work',
      binary: 'sbx',
      spawn,
    })
    await handle.destroy()
    expect(calls[0]).toEqual(['rm', '--force', 'deadbeefdeadbeef'])
  })

  it('declares networkPolicy true and kill/stdin false until measured', () => {
    expect(SBX_CAPS.networkPolicy).toBe(true)
    expect(SBX_CAPS.writableStdin).toBe(false)
    expect(SBX_CAPS.killableProcesses).toBe(false)
    expect(SBX_CAPS.snapshots).toBe(false)
    expect(SBX_CAPS.fork).toBe(false)
    expect(SBX_CAPS.fs).toBe(true)
    expect(SBX_CAPS.exec).toBe(true)
    expect(SBX_CAPS.durableFilesystem).toBe(true)
  })

  function handleWithFailedCommand(commandPrefix: string, stderr: string) {
    const { spawn } = scriptedSpawn([
      {
        match: (args) => args.some((arg) => arg.startsWith(commandPrefix)),
        result: { stdout: '', stderr, exitCode: 1 },
      },
    ])
    return new SbxHandle({
      name: 'deadbeefdeadbeef',
      workspaceRoot: '/home/user/work',
      binary: 'sbx',
      spawn,
    })
  }

  it('fs.mkdir throws when exec exits non-zero', async () => {
    const handle = handleWithFailedCommand(
      'mkdir -p',
      'mkdir: cannot create directory\n',
    )
    await expect(handle.fs.mkdir('/workspace/dir')).rejects.toThrow(
      /mkdir failed: mkdir: cannot create directory/,
    )
  })

  it('fs.remove throws when exec exits non-zero', async () => {
    const handle = handleWithFailedCommand(
      'rm -rf',
      'rm: cannot remove path\n',
    )
    await expect(handle.fs.remove('/workspace/dir')).rejects.toThrow(
      /remove failed: rm: cannot remove path/,
    )
  })

  it('fs.rename throws when exec exits non-zero', async () => {
    const handle = handleWithFailedCommand('mv ', 'mv: cannot move path\n')
    await expect(
      handle.fs.rename('/workspace/from', '/workspace/to'),
    ).rejects.toThrow(/rename failed: mv: cannot move path/)
  })

  it('stdin.write rejects because writableStdin is false', async () => {
    const { spawn } = scriptedSpawn([
      {
        match: (args) => args[0] === 'exec',
        result: { stdout: '', stderr: '', exitCode: 0 },
      },
    ])
    const handle = new SbxHandle({
      name: 'deadbeefdeadbeef',
      workspaceRoot: '/home/user/work',
      binary: 'sbx',
      spawn,
    })
    const proc = await handle.process.spawn('true')
    await expect(proc.stdin.write('x')).rejects.toThrow(/writableStdin/)
  })
})

const scratch: Array<string> = []
afterEach(async () => {
  await Promise.all(
    scratch.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  )
})

async function makeGitRepo(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), 'sbx-prov-'))
  scratch.push(dir)
  execFileSync('git', ['init'], { cwd: dir })
  execFileSync('git', ['config', 'user.email', 't@t.test'], { cwd: dir })
  execFileSync('git', ['config', 'user.name', 't'], { cwd: dir })
  await writeFile(path.join(dir, 'README.md'), 'hi\n')
  execFileSync('git', ['add', '.'], { cwd: dir })
  execFileSync('git', ['commit', '-m', 'init'], { cwd: dir })
  return dir
}

describe('sbxSandbox', () => {
  it('create uses --name --clone --quiet shell <hostDir>', async () => {
    const repo = await makeGitRepo()
    const { spawn, calls } = scriptedSpawn([
      {
        match: (args) =>
          args[0] === 'policy' && args[1] === 'ls' && args.includes('--json'),
        result: { stdout: '[{"name":"local"}]', stderr: '', exitCode: 0 },
      },
      {
        match: (args) => args[0] === 'create',
        result: { stdout: '', stderr: '', exitCode: 0 },
      },
      {
        match: (args) => args[0] === 'ls',
        result: {
          stdout: JSON.stringify([
            { name: 'deadbeefdeadbeef', workspace: '/home/user/work' },
          ]),
          stderr: '',
          exitCode: 0,
        },
      },
    ])
    const provider = sbxSandbox({
      workspaceDir: repo,
      spawn,
    })
    const handle = await provider.create({ id: 'deadbeefdeadbeef' })
    expect(handle.id).toBe('deadbeefdeadbeef')
    expect(handle.provider).toBe('sbx')
    expect(handle.workspaceRoot).toBe('/home/user/work')
    const create = calls.find((args) => args[0] === 'create')
    expect(create).toEqual([
      'create',
      '--name',
      'deadbeefdeadbeef',
      '--clone',
      '--quiet',
      'shell',
      repo,
    ])
  })

  it('create inits deny-all only when no global preset exists', async () => {
    const repo = await makeGitRepo()
    const { spawn, calls } = scriptedSpawn([
      {
        match: (args) =>
          args[0] === 'policy' && args[1] === 'ls' && args.includes('--json'),
        result: {
          stdout: '',
          stderr: 'no policy configured',
          exitCode: 1,
        },
      },
      {
        match: (args) =>
          args[0] === 'policy' && args[1] === 'init' && args[2] === 'deny-all',
        result: { stdout: '', stderr: '', exitCode: 0 },
      },
      {
        match: (args) => args[0] === 'create',
        result: { stdout: '', stderr: '', exitCode: 0 },
      },
      {
        match: (args) => args[0] === 'ls',
        result: {
          stdout: JSON.stringify([{ name: 'aabbccddeeff0011' }]),
          stderr: '',
          exitCode: 0,
        },
      },
      {
        match: (args) => args[0] === 'exec' && args.includes('pwd'),
        result: { stdout: '/home/user/work\n', stderr: '', exitCode: 0 },
      },
    ])
    const provider = sbxSandbox({ workspaceDir: repo, spawn })
    await provider.create({ id: 'aabbccddeeff0011' })
    expect(
      calls.some(
        (args) =>
          args[0] === 'policy' && args[1] === 'init' && args[2] === 'deny-all',
      ),
    ).toBe(true)
  })

  it('create inits deny-all when policy ls --json is an empty list', async () => {
    const repo = await makeGitRepo()
    const { spawn, calls } = scriptedSpawn([
      {
        match: (args) =>
          args[0] === 'policy' && args[1] === 'ls' && args.includes('--json'),
        result: { stdout: '[]', stderr: '', exitCode: 0 },
      },
      {
        match: (args) =>
          args[0] === 'policy' && args[1] === 'init' && args[2] === 'deny-all',
        result: { stdout: '', stderr: '', exitCode: 0 },
      },
      {
        match: (args) => args[0] === 'create',
        result: { stdout: '', stderr: '', exitCode: 0 },
      },
      {
        match: (args) => args[0] === 'ls',
        result: {
          stdout: JSON.stringify([{ name: 'aabbccddeeff0011' }]),
          stderr: '',
          exitCode: 0,
        },
      },
      {
        match: (args) => args[0] === 'exec' && args.includes('pwd'),
        result: { stdout: '/home/user/work\n', stderr: '', exitCode: 0 },
      },
    ])
    const provider = sbxSandbox({ workspaceDir: repo, spawn })
    await provider.create({ id: 'aabbccddeeff0011' })
    expect(
      calls.some(
        (args) =>
          args[0] === 'policy' && args[1] === 'init' && args[2] === 'deny-all',
      ),
    ).toBe(true)
  })

  it('resolves workspace root with exec flags before the sandbox name', async () => {
    const repo = await makeGitRepo()
    const { spawn, calls } = scriptedSpawn([
      {
        match: (args) =>
          args[0] === 'policy' && args[1] === 'ls' && args.includes('--json'),
        result: { stdout: '[{"name":"local"}]', stderr: '', exitCode: 0 },
      },
      {
        match: (args) => args[0] === 'create',
        result: { stdout: '', stderr: '', exitCode: 0 },
      },
      {
        match: (args) => args[0] === 'ls',
        result: {
          stdout: JSON.stringify([{ name: 'aabbccddeeff0011' }]),
          stderr: '',
          exitCode: 0,
        },
      },
      {
        match: (args) => args[0] === 'exec' && args.includes('pwd'),
        result: { stdout: '/home/user/work\n', stderr: '', exitCode: 0 },
      },
    ])
    const provider = sbxSandbox({ workspaceDir: repo, spawn })
    const handle = await provider.create({ id: 'aabbccddeeff0011' })
    expect(handle.workspaceRoot).toBe('/home/user/work')
    expect(calls).toContainEqual([
      'exec',
      '--',
      'aabbccddeeff0011',
      'sh',
      '-c',
      'pwd',
    ])
  })

  it('handle.destroy deletes an owned host clone', async () => {
    const source = await makeGitRepo()
    const id = 'cafebabedeadbeef'
    const { spawn } = scriptedSpawn([
      {
        match: (args) =>
          args[0] === 'policy' && args[1] === 'ls' && args.includes('--json'),
        result: { stdout: '[{"name":"local"}]', stderr: '', exitCode: 0 },
      },
      {
        match: (args) => args[0] === 'create',
        result: { stdout: '', stderr: '', exitCode: 0 },
      },
      {
        match: (args) => args[0] === 'ls',
        result: {
          stdout: JSON.stringify([{ name: id, workspace: '/home/user/work' }]),
          stderr: '',
          exitCode: 0,
        },
      },
      {
        match: (args) => args[0] === 'rm',
        result: { stdout: '', stderr: '', exitCode: 0 },
      },
    ])
    const provider = sbxSandbox({ spawn })
    const handle = await provider.create({
      id,
      workspace: defineWorkspace({
        source: gitSource({ url: source }),
      }),
    })
    const owned = path.join(tmpdir(), 'tanstack-sbx', id)
    await access(owned)
    await handle.destroy()
    await expect(access(owned)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('create applies per-sandbox policy after create', async () => {
    const repo = await makeGitRepo()
    const { spawn, calls } = scriptedSpawn([
      {
        match: (args) =>
          args[0] === 'policy' && args[1] === 'ls' && args.includes('--json'),
        result: { stdout: '[{"name":"local"}]', stderr: '', exitCode: 0 },
      },
      {
        match: (args) => args[0] === 'create',
        result: { stdout: '', stderr: '', exitCode: 0 },
      },
      {
        match: (args) => args[0] === 'policy' && args.includes('--sandbox'),
        result: { stdout: '', stderr: '', exitCode: 0 },
      },
      {
        match: (args) => args[0] === 'ls',
        result: {
          stdout: JSON.stringify([
            { name: 'deadbeefdeadbeef', workspace: '/home/user/work' },
          ]),
          stderr: '',
          exitCode: 0,
        },
      },
    ])
    const provider = sbxSandbox({
      workspaceDir: repo,
      allowNetwork: ['*.npmjs.org'],
      spawn,
    })
    await provider.create({
      id: 'deadbeefdeadbeef',
      adapterName: 'grok-build',
      policy: defineSandboxPolicy({ capabilities: { network: 'deny' } }),
    })
    expect(calls).toContainEqual([
      'policy',
      'allow',
      'network',
      '--sandbox',
      'deadbeefdeadbeef',
      'api.x.ai',
    ])
    expect(calls).toContainEqual([
      'policy',
      'allow',
      'network',
      '--sandbox',
      'deadbeefdeadbeef',
      '*.npmjs.org',
    ])
  })

  it('resume returns a handle when ls lists the name, including stopped', async () => {
    const { spawn } = scriptedSpawn([
      {
        match: (args) => args[0] === 'ls',
        result: {
          stdout: JSON.stringify([
            {
              name: 'deadbeefdeadbeef',
              status: 'stopped',
              workspace: '/home/user/work',
            },
          ]),
          stderr: '',
          exitCode: 0,
        },
      },
    ])
    const provider = sbxSandbox({ spawn })
    const handle = await provider.resume({ id: 'deadbeefdeadbeef' })
    expect(handle?.id).toBe('deadbeefdeadbeef')
    expect(handle?.workspaceRoot).toBe('/home/user/work')
  })

  it('resume returns null when the name is missing', async () => {
    const { spawn } = scriptedSpawn([
      {
        match: (args) => args[0] === 'ls',
        result: { stdout: '[]', stderr: '', exitCode: 0 },
      },
    ])
    const provider = sbxSandbox({ spawn })
    expect(await provider.resume({ id: 'missingmissing00' })).toBeNull()
  })

  it('destroy runs sbx rm --force and does not delete a user workspaceDir', async () => {
    const repo = await makeGitRepo()
    const { spawn, calls } = scriptedSpawn([
      {
        match: (args) => args[0] === 'rm',
        result: { stdout: '', stderr: '', exitCode: 0 },
      },
    ])
    const provider = sbxSandbox({ workspaceDir: repo, spawn })
    await provider.destroy({ id: 'deadbeefdeadbeef' })
    expect(calls[0]).toEqual(['rm', '--force', 'deadbeefdeadbeef'])
    await access(repo)
  })

  it('fails loud when create has no Git repo', async () => {
    const provider = sbxSandbox({
      spawn: scriptedSpawn([]).spawn,
    })
    await expect(
      provider.create({
        id: 'deadbeefdeadbeef',
        workspace: defineWorkspace({ source: { type: 'none' } }),
      }),
    ).rejects.toThrow(/sbxSandbox needs a Git repository/)
  })

  it('create without input.id mints a non-empty id and uses it as --name', async () => {
    const repo = await makeGitRepo()
    const { spawn, calls } = scriptedSpawn([
      {
        match: (args) =>
          args[0] === 'policy' && args[1] === 'ls' && args.includes('--json'),
        result: { stdout: '[{"name":"local"}]', stderr: '', exitCode: 0 },
      },
      {
        match: (args) => args[0] === 'create',
        result: { stdout: '', stderr: '', exitCode: 0 },
      },
      {
        match: (args) => args[0] === 'ls',
        result: { stdout: '[]', stderr: '', exitCode: 0 },
      },
      {
        match: (args) => args[0] === 'exec' && args.includes('pwd'),
        result: { stdout: '/home/user/work\n', stderr: '', exitCode: 0 },
      },
    ])
    const provider = sbxSandbox({ workspaceDir: repo, spawn })
    const handle = await provider.create({})
    expect(handle.id).toEqual(expect.any(String))
    expect(handle.id.length).toBeGreaterThan(0)
    expect(handle.id).not.toMatch(/[/\\]/)
    const create = calls.find((args) => args[0] === 'create')
    expect(create?.[2]).toBe(handle.id)
    expect(create).toEqual([
      'create',
      '--name',
      handle.id,
      '--clone',
      '--quiet',
      'shell',
      repo,
    ])
  })

  it('create rejects a path-traversal id and does not call sbx create', async () => {
    const repo = await makeGitRepo()
    const { spawn, calls } = scriptedSpawn([
      {
        match: () => true,
        result: { stdout: '', stderr: '', exitCode: 0 },
      },
    ])
    const provider = sbxSandbox({ workspaceDir: repo, spawn })
    await expect(
      provider.create({ id: `..${path.sep}..${path.sep}Windows` }),
    ).rejects.toThrow(/sandbox id/)
    expect(calls.some((args) => args[0] === 'create')).toBe(false)
  })

  it('destroy rejects a path-traversal id and does not rm outside tanstack-sbx', async () => {
    const probeName = `sbx-a3-destroy-${Date.now()}`
    const escaped = path.resolve(path.join(tmpdir(), 'tanstack-sbx', '..', probeName))
    const { spawn, calls } = scriptedSpawn([
      {
        match: (args) => args[0] === 'rm',
        result: { stdout: '', stderr: '', exitCode: 0 },
      },
    ])
    const provider = sbxSandbox({ spawn })
    await expect(
      provider.destroy({ id: `..${path.sep}${probeName}` }),
    ).rejects.toThrow(/sandbox id/)
    expect(calls.some((args) => args[0] === 'rm')).toBe(false)
    await expect(access(escaped)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

describe('package exports', () => {
  it('exports both dockerSandbox and sbxSandbox from the barrel', () => {
    expect(typeof dockerSandbox).toBe('function')
    expect(typeof sbxSandboxFromBarrel).toBe('function')
    expect(sbxSandboxFromBarrel().name).toBe('sbx')
    expect(dockerSandbox({ image: 'alpine:3' }).name).toBe('docker')
  })
})
