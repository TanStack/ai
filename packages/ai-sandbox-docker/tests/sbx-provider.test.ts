import { describe, expect, it } from 'vitest'
import { SbxHandle, SBX_CAPS } from '../src/sbx/handle'
import type { SbxRunResult, SbxSpawn } from '../src/sbx/cli'

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
