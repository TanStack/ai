import { access, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import { SbxHandle, SBX_CAPS } from '../src/sbx/handle'
import { sbxSandbox } from '../src/sbx/provider'
import type { SbxRunResult, SbxSpawn } from '../src/sbx/cli'
import { defineSandboxPolicy, defineWorkspace } from '@tanstack/ai-sandbox'
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
    expect(calls[0]?.[0]).toBe('exec')
    expect(calls[0]).toContain('deadbeefdeadbeef')
    expect(calls[0]).toContain('--')
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
        match: (args) => args[0] === 'policy' && args[1] === '--json',
        result: { stdout: '{"preset":"deny-all"}', stderr: '', exitCode: 0 },
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
        match: (args) => args[0] === 'policy' && args[1] === '--json',
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

  it('create applies per-sandbox policy after create', async () => {
    const repo = await makeGitRepo()
    const { spawn, calls } = scriptedSpawn([
      {
        match: (args) => args[0] === 'policy' && args[1] === '--json',
        result: { stdout: '{"preset":"deny-all"}', stderr: '', exitCode: 0 },
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
      'api.x.ai',
      '--sandbox',
      'deadbeefdeadbeef',
    ])
    expect(calls).toContainEqual([
      'policy',
      'allow',
      '*.npmjs.org',
      '--sandbox',
      'deadbeefdeadbeef',
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
})

describe('package exports', () => {
  it('exports both dockerSandbox and sbxSandbox from the barrel', () => {
    expect(typeof dockerSandbox).toBe('function')
    expect(typeof sbxSandboxFromBarrel).toBe('function')
    expect(sbxSandboxFromBarrel().name).toBe('sbx')
    expect(dockerSandbox({ image: 'alpine:3' }).name).toBe('docker')
  })
})
