import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineWorkspace } from '@tanstack/ai-sandbox'
import { createCloudflareSandboxAgent } from '../src/factory'
import { fakeCoordinatorState, seedRunningRecord } from './fixtures'
import type { AnyTextAdapter } from '@tanstack/ai'
import type {
  CloudflareSandboxAgentConfig,
  SandboxAgentEnv,
} from '../src/factory'

vi.mock('@cloudflare/sandbox', () => ({
  Sandbox: class {},
  getSandbox: vi.fn(),
}))

const workspace = defineWorkspace({ source: { type: 'none' } })
const adapter = {} as unknown as AnyTextAdapter

type Mode = 'do-drives' | 'colocated'

function configFor(
  mode: Mode,
  stallTimeoutMs?: number | false,
): CloudflareSandboxAgentConfig<SandboxAgentEnv> {
  const policy = stallTimeoutMs === undefined ? {} : { stallTimeoutMs }
  return mode === 'colocated'
    ? {
        mode,
        harness: 'claude-code',
        model: 'test-model',
        workspace,
        ...policy,
      }
    : { mode, adapter: () => adapter, ...policy }
}

async function statusAfterAlarm(
  mode: Mode,
  stallTimeoutMs: number | false | undefined,
  staleAge: number,
): Promise<string | undefined> {
  const now = 2_000_000
  vi.spyOn(Date, 'now').mockReturnValue(now)
  const agent = createCloudflareSandboxAgent(configFor(mode, stallTimeoutMs))
  const fixture = fakeCoordinatorState()
  seedRunningRecord(fixture.storage, { updatedAt: now - staleAge })
  const coordinator = new agent.Coordinator(
    fixture.state,
    {} as SandboxAgentEnv,
  )
  fixture.storage.alarm = now - 1
  await fixture.invokeAlarm(coordinator)
  expect(fixture.storage.alarm).toBeNull()
  return (await coordinator.status('run-1'))?.status
}

describe('createCloudflareSandboxAgent watchdog config', () => {
  afterEach(() => vi.restoreAllMocks())

  it.each<{
    name: string
    mode: Mode
    stallTimeoutMs: number | false | undefined
    staleAge: number
    expectedStatus: 'failed' | 'running'
  }>([
    {
      name: 'default do-drives',
      mode: 'do-drives',
      stallTimeoutMs: undefined,
      staleAge: 300_001,
      expectedStatus: 'failed',
    },
    {
      name: 'custom do-drives',
      mode: 'do-drives',
      stallTimeoutMs: 1_000,
      staleAge: 1_001,
      expectedStatus: 'failed',
    },
    {
      name: 'custom colocated',
      mode: 'colocated',
      stallTimeoutMs: 1_000,
      staleAge: 1_001,
      expectedStatus: 'failed',
    },
    {
      name: 'disabled colocated',
      mode: 'colocated',
      stallTimeoutMs: false,
      staleAge: 1_000_000,
      expectedStatus: 'running',
    },
  ])('$name', async ({ mode, stallTimeoutMs, staleAge, expectedStatus }) => {
    expect(await statusAfterAlarm(mode, stallTimeoutMs, staleAge)).toBe(
      expectedStatus,
    )
  })

  it('rejects invalid timeout values eagerly', () => {
    for (const invalid of [0, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() =>
        createCloudflareSandboxAgent(configFor('do-drives', invalid)),
      ).toThrow(TypeError)
    }
  })
})
