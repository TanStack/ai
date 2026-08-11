import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import { SbxHandle, SBX_CAPS } from '../src/sbx/handle'
import { sbxSandbox } from '../src/sbx/provider'
import { ownedHostRepoDir } from '../src/sbx/materialize'
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
    result: SbxRunResult | (() => SbxRunResult)
  }>,
): { spawn: SbxSpawn; calls: Array<Array<string>> } {
  const calls: Array<Array<string>> = []
  const spawn: SbxSpawn = (_bin, args, opts) => {
    calls.push(args)
    const hit = scripts.find((s) => s.match(args))
    const resolved = hit?.result
    const result =
      typeof resolved === 'function'
        ? resolved()
        : (resolved ?? {
            stdout: '',
            stderr: `unexpected sbx ${args.join(' ')}`,
            exitCode: 1,
          })
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

  it('handle.destroy does not delete the host dest when owned is false', async () => {
    const id = 'a12unownedfalse1'
    const dest = ownedHostRepoDir(id)
    await mkdir(dest, { recursive: true })
    await writeFile(path.join(dest, 'marker.txt'), 'keep\n')
    scratch.push(dest)
    const { spawn } = scriptedSpawn([
      {
        match: (args) => args[0] === 'rm',
        result: { stdout: '', stderr: '', exitCode: 0 },
      },
    ])
    const handle = new SbxHandle({
      name: id,
      workspaceRoot: '/home/user/work',
      binary: 'sbx',
      spawn,
      owned: false,
    })
    await handle.destroy()
    await access(dest)
    await access(path.join(dest, 'marker.txt'))
  })

  it('handle.destroy deletes the owned dest then rethrows when sbx rm fails', async () => {
    const id = 'a12ownedrmfail01'
    const dest = ownedHostRepoDir(id)
    await mkdir(dest, { recursive: true })
    await writeFile(path.join(dest, 'marker.txt'), 'owned\n')
    scratch.push(dest)
    const { spawn } = scriptedSpawn([
      {
        match: (args) => args[0] === 'rm',
        result: { stdout: '', stderr: 'rm failed', exitCode: 1 },
      },
    ])
    const handle = new SbxHandle({
      name: id,
      workspaceRoot: '/home/user/work',
      binary: 'sbx',
      spawn,
      owned: true,
    })
    await expect(handle.destroy()).rejects.toThrow(/rm failed/)
    await expect(access(dest)).rejects.toMatchObject({ code: 'ENOENT' })
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
      {
        match: (args) => args[0] === 'exec' && args.includes('pwd'),
        result: { stdout: '/home/user/work\n', stderr: '', exitCode: 0 },
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

  it('create sets workspaceRoot from in-VM pwd even when ls has a workspace field', async () => {
    const repo = await makeGitRepo()
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
          stdout: JSON.stringify([
            { name: 'deadbeefdeadbeef', workspace: 'C:\\host\\repo' },
          ]),
          stderr: '',
          exitCode: 0,
        },
      },
      {
        match: (args) => args[0] === 'exec' && args.includes('pwd'),
        result: { stdout: '/home/user/work\n', stderr: '', exitCode: 0 },
      },
    ])
    const provider = sbxSandbox({
      workspaceDir: repo,
      spawn,
    })
    const handle = await provider.create({ id: 'deadbeefdeadbeef' })
    expect(handle.workspaceRoot).toBe('/home/user/work')
  })

  it('create does not init deny-all when policy ls fails', async () => {
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
    ])
    const provider = sbxSandbox({ workspaceDir: repo, spawn })
    await expect(provider.create({ id: 'aabbccddeeff0011' })).rejects.toThrow(
      /no policy configured/,
    )
    expect(
      calls.some(
        (args) =>
          args[0] === 'policy' && args[1] === 'init' && args[2] === 'deny-all',
      ),
    ).toBe(false)
    expect(calls.some((args) => args[0] === 'create')).toBe(false)
  })

  it('first create with empty policy list inits deny-all', async () => {
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

  it('second create with empty policy list treats already-initialized as success', async () => {
    const repo = await makeGitRepo()
    let initCalls = 0
    const { spawn } = scriptedSpawn([
      {
        match: (args) =>
          args[0] === 'policy' && args[1] === 'ls' && args.includes('--json'),
        result: { stdout: '[]', stderr: '', exitCode: 0 },
      },
      {
        match: (args) =>
          args[0] === 'policy' && args[1] === 'init' && args[2] === 'deny-all',
        result: () => {
          initCalls += 1
          if (initCalls === 1) {
            return { stdout: '', stderr: '', exitCode: 0 }
          }
          return {
            stdout: '',
            stderr: 'policy already initialized',
            exitCode: 1,
          }
        },
      },
      {
        match: (args) => args[0] === 'create',
        result: { stdout: '', stderr: '', exitCode: 0 },
      },
      {
        match: (args) => args[0] === 'exec' && args.includes('pwd'),
        result: { stdout: '/home/user/work\n', stderr: '', exitCode: 0 },
      },
    ])
    const provider = sbxSandbox({ workspaceDir: repo, spawn })
    await provider.create({ id: 'aabbccddeeff0011' })
    await expect(
      provider.create({ id: 'bbccddeeff001122' }),
    ).resolves.toMatchObject({ id: 'bbccddeeff001122' })
  })

  it('deny/ask allowlist on an Open machine fails closed', async () => {
    const repo = await makeGitRepo()
    const { spawn, calls } = scriptedSpawn([
      {
        match: (args) =>
          args[0] === 'policy' && args[1] === 'ls' && args.includes('--json'),
        result: {
          stdout: JSON.stringify([{ name: 'open', resources: ['**'] }]),
          stderr: '',
          exitCode: 0,
        },
      },
      {
        match: (args) => args[0] === 'create',
        result: { stdout: '', stderr: '', exitCode: 0 },
      },
    ])
    const provider = sbxSandbox({
      workspaceDir: repo,
      allowNetwork: ['*.npmjs.org'],
      spawn,
    })
    await expect(
      provider.create({
        id: 'deadbeefdeadbeef',
        adapterName: 'grok-build',
        policy: defineSandboxPolicy({ capabilities: { network: 'deny' } }),
      }),
    ).rejects.toThrow(/open|allow-all|\*\*/i)
    expect(calls.some((args) => args[0] === 'create')).toBe(false)
  })

  it('create does not treat a JSON error object as an existing policy', async () => {
    const repo = await makeGitRepo()
    const { spawn, calls } = scriptedSpawn([
      {
        match: (args) =>
          args[0] === 'policy' && args[1] === 'ls' && args.includes('--json'),
        result: { stdout: '{"error":"boom"}', stderr: '', exitCode: 0 },
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
    ])
    const provider = sbxSandbox({ workspaceDir: repo, spawn })
    await expect(provider.create({ id: 'aabbccddeeff0011' })).rejects.toThrow(
      /no policy list/,
    )
    expect(
      calls.some(
        (args) =>
          args[0] === 'policy' && args[1] === 'init' && args[2] === 'deny-all',
      ),
    ).toBe(false)
    expect(calls.some((args) => args[0] === 'create')).toBe(false)
  })

  it.each([
    { stdout: '{ "policies": [] }', label: '{ policies: [] }' },
    { stdout: '{ "items": [] }', label: '{ items: [] }' },
    { stdout: '{ "rules": [] }', label: '{ rules: [] }' },
  ])(
    'create inits deny-all when policy ls --json is $label',
    async ({ stdout }) => {
      const repo = await makeGitRepo()
      const { spawn, calls } = scriptedSpawn([
        {
          match: (args) =>
            args[0] === 'policy' && args[1] === 'ls' && args.includes('--json'),
          result: { stdout, stderr: '', exitCode: 0 },
        },
        {
          match: (args) =>
            args[0] === 'policy' &&
            args[1] === 'init' &&
            args[2] === 'deny-all',
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
            args[0] === 'policy' &&
            args[1] === 'init' &&
            args[2] === 'deny-all',
        ),
      ).toBe(true)
    },
  )

  it('create does not init deny-all when policy ls --json has policy rows', async () => {
    const repo = await makeGitRepo()
    const { spawn, calls } = scriptedSpawn([
      {
        match: (args) =>
          args[0] === 'policy' && args[1] === 'ls' && args.includes('--json'),
        result: {
          stdout: '{ "policies": [{ "name": "local" }] }',
          stderr: '',
          exitCode: 0,
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
          stdout: JSON.stringify([
            { name: 'aabbccddeeff0011', workspace: '/home/user/work' },
          ]),
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
    expect(handle.id).toBe('aabbccddeeff0011')
    expect(
      calls.some(
        (args) =>
          args[0] === 'policy' && args[1] === 'init' && args[2] === 'deny-all',
      ),
    ).toBe(false)
    expect(calls.some((args) => args[0] === 'create')).toBe(true)
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
        match: (args) => args[0] === 'exec' && args.includes('pwd'),
        result: { stdout: '/home/user/work\n', stderr: '', exitCode: 0 },
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
      {
        match: (args) => args[0] === 'exec' && args.includes('pwd'),
        result: { stdout: '/home/user/work\n', stderr: '', exitCode: 0 },
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

  it('create rms the sandbox when per-sandbox policy apply fails', async () => {
    const repo = await makeGitRepo()
    const id = 'deadbeefdeadbeef'
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
        result: {
          stdout: '',
          stderr: 'policy apply failed',
          exitCode: 1,
        },
      },
      {
        match: (args) => args[0] === 'rm',
        result: { stdout: '', stderr: '', exitCode: 0 },
      },
    ])
    const provider = sbxSandbox({
      workspaceDir: repo,
      allowNetwork: ['*.npmjs.org'],
      spawn,
    })
    await expect(
      provider.create({
        id,
        adapterName: 'grok-build',
        policy: defineSandboxPolicy({ capabilities: { network: 'deny' } }),
      }),
    ).rejects.toThrow(/policy apply failed/)
    expect(calls).toContainEqual(['rm', '--force', id])
  })

  it('create rms the sandbox when workspace resolve fails', async () => {
    const repo = await makeGitRepo()
    const id = 'deadbeefdeadbeef'
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
        match: (args) => args[0] === 'exec' && args.includes('pwd'),
        result: { stdout: '', stderr: 'pwd failed', exitCode: 1 },
      },
      {
        match: (args) => args[0] === 'rm',
        result: { stdout: '', stderr: '', exitCode: 0 },
      },
    ])
    const provider = sbxSandbox({ workspaceDir: repo, spawn })
    await expect(provider.create({ id })).rejects.toThrow(/pwd failed/)
    expect(calls).toContainEqual(['rm', '--force', id])
  })

  it('create rms the sandbox when env.set fails', async () => {
    const repo = await makeGitRepo()
    const id = 'deadbeefdeadbeef'
    const envWrite: Record<string, string> = {}
    Object.defineProperty(envWrite, 'FOO', {
      enumerable: true,
      get() {
        throw new Error('env write failed')
      },
    })
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
          stdout: JSON.stringify([{ name: id, workspace: '/home/user/work' }]),
          stderr: '',
          exitCode: 0,
        },
      },
      {
        match: (args) => args[0] === 'exec' && args.includes('pwd'),
        result: { stdout: '/home/user/work\n', stderr: '', exitCode: 0 },
      },
      {
        match: (args) => args[0] === 'rm',
        result: { stdout: '', stderr: '', exitCode: 0 },
      },
    ])
    const provider = sbxSandbox({ workspaceDir: repo, spawn })
    await expect(provider.create({ id, env: envWrite })).rejects.toThrow(
      /env write failed/,
    )
    expect(calls).toContainEqual(['rm', '--force', id])
  })

  it('create rethrows the setup error when rm after a failed setup also fails', async () => {
    const repo = await makeGitRepo()
    const id = 'deadbeefdeadbeef'
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
        match: (args) => args[0] === 'exec' && args.includes('pwd'),
        result: { stdout: '', stderr: 'pwd failed', exitCode: 1 },
      },
      {
        match: (args) => args[0] === 'rm',
        result: { stdout: '', stderr: 'rm failed', exitCode: 1 },
      },
    ])
    const provider = sbxSandbox({ workspaceDir: repo, spawn })
    await expect(provider.create({ id })).rejects.toThrow(/pwd failed/)
    expect(calls).toContainEqual(['rm', '--force', id])
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
              workspace: 'C:\\host\\repo',
            },
          ]),
          stderr: '',
          exitCode: 0,
        },
      },
      {
        match: (args) => args[0] === 'exec' && args.includes('pwd'),
        result: { stdout: '/home/user/work\n', stderr: '', exitCode: 0 },
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

  it('provider.destroy rethrows sbx rm errors that are not already-gone', async () => {
    const id = 'a12provrmfail001'
    const dest = ownedHostRepoDir(id)
    await mkdir(dest, { recursive: true })
    await writeFile(path.join(dest, 'marker.txt'), 'owned\n')
    scratch.push(dest)
    const { spawn } = scriptedSpawn([
      {
        match: (args) => args[0] === 'rm',
        result: { stdout: '', stderr: 'rm failed', exitCode: 1 },
      },
    ])
    const provider = sbxSandbox({ spawn })
    await expect(provider.destroy({ id })).rejects.toThrow(/rm failed/)
    await expect(access(dest)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('provider.destroy does not throw when sbx rm says the sandbox is already gone', async () => {
    const id = 'a12provgone00001'
    const dest = ownedHostRepoDir(id)
    await mkdir(dest, { recursive: true })
    await writeFile(path.join(dest, 'marker.txt'), 'owned\n')
    scratch.push(dest)
    const { spawn } = scriptedSpawn([
      {
        match: (args) => args[0] === 'rm',
        result: { stdout: '', stderr: 'sandbox not found', exitCode: 1 },
      },
    ])
    const provider = sbxSandbox({ spawn })
    await provider.destroy({ id })
    await expect(access(dest)).rejects.toMatchObject({ code: 'ENOENT' })
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
