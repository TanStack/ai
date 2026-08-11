import { describe, expect, it } from 'vitest'
import { isAlreadyGone, SbxHandle } from '../src/sbx/handle'
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

function handleWithPortsJson(stdout: string): SbxHandle {
  const { spawn } = scriptedSpawn([
    {
      match: (args) => args[0] === 'ports' && args.includes('--publish'),
      result: { stdout: '', stderr: '', exitCode: 0 },
    },
    {
      match: (args) => args[0] === 'ports' && args.includes('--json'),
      result: { stdout, stderr: '', exitCode: 0 },
    },
  ])
  return new SbxHandle({
    name: 'deadbeefdeadbeef',
    workspaceRoot: '/home/user/work',
    binary: 'sbx',
    spawn,
  })
}

describe('SbxHandle ports.connect JSON shapes', () => {
  it('ports.connect reads sandbox_port/host_port', async () => {
    const handle = handleWithPortsJson(
      JSON.stringify([{ sandbox_port: 3000, host_port: 41000 }]),
    )
    const channel = await handle.ports.connect(3000)
    expect(channel.url).toBe('http://localhost:41000')
  })

  it('ports.connect reads string host_port and string map values', async () => {
    const mapHandle = handleWithPortsJson(JSON.stringify({ '3000': '41000' }))
    const mapChannel = await mapHandle.ports.connect(3000)
    expect(mapChannel.url).toBe('http://localhost:41000')

    const listHandle = handleWithPortsJson(
      JSON.stringify([{ sandbox_port: '3000', host_port: '41000' }]),
    )
    const listChannel = await listHandle.ports.connect(3000)
    expect(listChannel.url).toBe('http://localhost:41000')
  })

  it('ports.connect still reads { "3000": 41000 } and port/hostPort and Port/HostPort', async () => {
    const mapHandle = handleWithPortsJson(JSON.stringify({ '3000': 41000 }))
    const mapChannel = await mapHandle.ports.connect(3000)
    expect(mapChannel.url).toBe('http://localhost:41000')

    const camelHandle = handleWithPortsJson(
      JSON.stringify([{ port: 3000, hostPort: 41000 }]),
    )
    const camelChannel = await camelHandle.ports.connect(3000)
    expect(camelChannel.url).toBe('http://localhost:41000')

    const pascalHandle = handleWithPortsJson(
      JSON.stringify([{ Port: 3000, HostPort: 41000 }]),
    )
    const pascalChannel = await pascalHandle.ports.connect(3000)
    expect(pascalChannel.url).toBe('http://localhost:41000')
  })
})

function handleWithRmStderr(stderr: string): SbxHandle {
  const { spawn } = scriptedSpawn([
    {
      match: (args) => args[0] === 'rm',
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

describe('isAlreadyGone / destroy already-gone', () => {
  it('destroy sandbox not found is gone', async () => {
    expect(isAlreadyGone(new Error('sandbox not found'))).toBe(true)
    await expect(
      handleWithRmStderr('sandbox not found').destroy(),
    ).resolves.toBeUndefined()
  })

  it('destroy file does not exist in a login page is NOT gone', async () => {
    const loginPage =
      '<html><head><title>Login</title></head><body>file does not exist</body></html>'
    expect(isAlreadyGone(new Error(loginPage))).toBe(false)
    await expect(handleWithRmStderr(loginPage).destroy()).rejects.toThrow(
      /file does not exist/,
    )
  })

  it('generic does not exist is NOT gone', () => {
    expect(isAlreadyGone('file does not exist')).toBe(false)
  })

  it('no such sandbox / not found sandbox still gone', () => {
    expect(isAlreadyGone(new Error('no such sandbox'))).toBe(true)
    expect(isAlreadyGone(new Error('not found sandbox'))).toBe(true)
  })
})
