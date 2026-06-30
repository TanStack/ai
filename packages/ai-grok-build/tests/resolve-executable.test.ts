import { describe, expect, it } from 'vitest'
import { resolveGrokExecutable } from '../src/process/resolve-executable'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

function mockSandbox(
  exec: SandboxHandle['process']['exec'],
  provider = 'daytona',
): SandboxHandle {
  return {
    id: 'test',
    provider,
    process: { exec, spawn: async () => ({ kill: async () => {} }) },
  } as unknown as SandboxHandle
}

describe('resolveGrokExecutable', () => {
  it('returns host grok on local-process', async () => {
    const sandbox = mockSandbox(async () => ({
      stdout: '',
      stderr: '',
      exitCode: 1,
    }), 'local-process')
    await expect(resolveGrokExecutable(sandbox)).resolves.toBe('grok')
  })

  it('honours an explicit non-default path', async () => {
    const sandbox = mockSandbox(async () => ({
      stdout: '',
      stderr: '',
      exitCode: 1,
    }))
    await expect(
      resolveGrokExecutable(sandbox, '/opt/grok'),
    ).resolves.toBe('/opt/grok')
  })

  it('probes the sandbox when grok is not on PATH', async () => {
    const sandbox = mockSandbox(async () => ({
      stdout: '/home/daytona/.grok/bin/grok',
      stderr: '',
      exitCode: 0,
    }))
    await expect(resolveGrokExecutable(sandbox)).resolves.toBe(
      '/home/daytona/.grok/bin/grok',
    )
  })
})