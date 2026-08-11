import { describe, expect, it } from 'vitest'
import { SbxHandle } from '../src/sbx/handle'
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
