import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineWorkspace } from '@tanstack/ai-sandbox'
import { ChatSandboxCoordinator } from '../src/chat-coordinator'
import { ContainerSandboxCoordinator } from '../src/container-coordinator'
import {
  hasInFlightCallback,
  runWithCallbackActivity,
} from '../src/coordinator-callbacks'
import { deferred, fakeCoordinatorState, seedRunningRecord } from './fixtures'
import type { AnyTextAdapter } from '@tanstack/ai'
import type {
  SandboxDefinition,
  ToolBridgeProvisioner,
} from '@tanstack/ai-sandbox'

const mocks = vi.hoisted(() => ({
  operation: vi.fn(),
  provisioned: undefined as Promise<{ token: string }> | undefined,
}))
vi.mock('@cloudflare/sandbox', () => ({ getSandbox: vi.fn() }))
type MockChatOptions = { middleware: [{ setup(context: never): void }] }
vi.mock('@tanstack/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/ai')>()
  return {
    ...actual,
    chat: vi.fn((options: MockChatOptions) => {
      let provisioner: ToolBridgeProvisioner | undefined
      options.middleware[0].setup({
        provide: (_capability: unknown, value: ToolBridgeProvisioner) =>
          (provisioner = value),
      } as never)
      if (!provisioner) throw new Error('bridge provisioner was not provided')
      mocks.provisioned = provisioner.provision([], { provider: 'test' })
      return (async function* () {})()
    }),
  }
})
vi.mock('@tanstack/ai-sandbox', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/ai-sandbox')>()
  return {
    ...actual,
    createToolBridgeCore: () => ({}),
    handleBridgeJsonRpc: (...args: Array<unknown>) => mocks.operation(...args),
    executeHostTool: (...args: Array<unknown>) => mocks.operation(...args),
    withSandbox: () => ({ name: 'test-sandbox' }),
  }
})
const workspace = defineWorkspace({ source: { type: 'none' } })
const input = { runId: 'run-1', threadId: 'thread-1', messages: [] }
const uuid = '00000000-0000-4000-8000-000000000000'
const containerToken = `${uuid}${uuid.replaceAll('-', '')}`
type Mode = 'do-drives' | 'colocated'
class TestChatCoordinator extends ChatSandboxCoordinator {
  constructor(state: DurableObjectState) {
    super(state, { PUBLIC_HOSTNAME: 'example.com' }, 100)
  }
  async activate(): Promise<string> {
    this.buildRunStream(input)
    const provisioned = await mocks.provisioned
    if (!provisioned) throw new Error('bridge was not provisioned')
    return provisioned.token
  }
  protected config() {
    return { adapter: {} as AnyTextAdapter, sandbox: {} as SandboxDefinition }
  }
}
class TestContainerCoordinator extends ContainerSandboxCoordinator {
  constructor(state: DurableObjectState) {
    super(state, { Sandbox: {} as never, PUBLIC_HOSTNAME: 'example.com' }, 100)
  }
  activate(): Promise<string> {
    this.buildRunStream(input)
    return Promise.resolve(containerToken)
  }
  protected config() {
    return {
      hostTools: [],
      workspace,
      harness: 'claude-code' as const,
      model: 'test-model',
    }
  }
}
async function setup(mode: Mode) {
  const { state, storage } = fakeCoordinatorState()
  seedRunningRecord(storage, { updatedAt: 100 })
  const coordinator =
    mode === 'do-drives'
      ? new TestChatCoordinator(state)
      : new TestContainerCoordinator(state)
  return { coordinator, token: await coordinator.activate() }
}
function callbackRequest(mode: Mode, token: string, runId = input.runId) {
  const path = mode === 'do-drives' ? '_bridge' : 'tool-exec'
  return new Request(`https://example.com/${path}/${runId}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify(
      mode === 'do-drives'
        ? { jsonrpc: '2.0', id: 1, method: 'tools/list' }
        : { name: 'test-tool', args: {} },
    ),
  })
}
afterEach(() => {
  mocks.operation.mockReset()
  mocks.provisioned = undefined
  vi.restoreAllMocks()
})
describe('runWithCallbackActivity', () => {
  it('reference-counts overlaps while isolating runs and owners', async () => {
    const owner = {}
    const otherOwner = {}
    const first = deferred()
    const last = deferred()
    const isolated = deferred()
    const allEntered = deferred()
    const activity: Array<string> = []
    let entered = 0
    const start = (
      callbackOwner: object,
      runId: string,
      gate: { promise: Promise<void> },
      label?: string,
    ) =>
      runWithCallbackActivity(
        callbackOwner,
        runId,
        async () => {
          if (label) activity.push(`${label}:touch`)
        },
        async () => {
          if (label) activity.push(`${label}:operation`)
          entered += 1
          if (entered === 4) allEntered.resolve()
          return gate.promise
        },
      )
    const firstPending = start(owner, 'run-1', first, 'first')
    const lastPending = start(owner, 'run-1', last, 'last')
    const isolatedPending = [
      start(owner, 'run-2', isolated),
      start(otherOwner, 'run-1', isolated),
    ]
    await allEntered.promise
    const initial = 'first:touch,last:touch,first:operation,last:operation'
    expect(activity.join()).toBe(initial)
    expect(hasInFlightCallback(owner, 'run-1')).toBe(true)
    expect(hasInFlightCallback(owner, 'run-2')).toBe(true)
    expect(hasInFlightCallback(otherOwner, 'run-1')).toBe(true)
    first.resolve()
    await firstPending
    expect(activity.join()).toBe(`${initial},first:touch`)
    expect(hasInFlightCallback(owner, 'run-1')).toBe(true)
    isolated.resolve()
    await Promise.all(isolatedPending)
    expect(hasInFlightCallback(owner, 'run-2')).toBe(false)
    expect(hasInFlightCallback(otherOwner, 'run-1')).toBe(false)
    expect(hasInFlightCallback(owner, 'run-1')).toBe(true)
    last.resolve()
    await lastPending
    expect(activity.join()).toBe(`${initial},first:touch,last:touch`)
    expect(hasInFlightCallback(owner, 'run-1')).toBe(false)
  })
  it('propagates an arrival-touch failure without entering the operation', async () => {
    const owner = {}
    const activity: Array<string> = []
    await expect(
      runWithCallbackActivity(
        owner,
        'run-1',
        () => Promise.reject(new Error('arrival failed')),
        async () => activity.push('operation'),
      ),
    ).rejects.toThrow('arrival failed')
    expect(activity).toEqual([])
    expect(hasInFlightCallback(owner, 'run-1')).toBe(false)
  })
  it('preserves resolve and reject outcomes when completion touch fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const owner = {}
    const original = new Error('operation failed')
    for (const outcome of ['resolve', 'reject'] as const) {
      const activity: Array<string> = []
      let touches = 0
      const pending = runWithCallbackActivity(
        owner,
        'run-1',
        async () => {
          activity.push('touch')
          touches += 1
          if (touches === 2) throw new Error('completion failed')
        },
        async () => {
          activity.push('operation')
          if (outcome === 'reject') throw original
          return 'ok'
        },
      )
      if (outcome === 'resolve') await expect(pending).resolves.toBe('ok')
      else await expect(pending).rejects.toBe(original)
      expect(activity).toEqual(['touch', 'operation', 'touch'])
      expect(hasInFlightCallback(owner, 'run-1')).toBe(false)
    }
  })
})
describe.each([
  ['do-drives', { jsonrpc: '2.0', id: 1, result: 'ok' }],
  ['colocated', 'ok'],
] as const)('%s callback endpoint', (mode, operationResult) => {
  it('authenticates callbacks and records arrival and completion activity', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(100)
    vi.spyOn(crypto, 'randomUUID').mockReturnValue(uuid)
    const { coordinator, token } = await setup(mode)
    now.mockReturnValue(200)
    const [unknown, unauthorized] = await Promise.all([
      coordinator.fetch(callbackRequest(mode, token, 'unknown')),
      coordinator.fetch(callbackRequest(mode, 'wrong-token')),
    ])
    expect([unknown.status, unauthorized.status]).toEqual([404, 401])
    expect((await coordinator.status(input.runId))?.updatedAt).toBe(100)
    const entered = deferred()
    const operation = deferred<unknown>()
    mocks.operation.mockImplementation(() => {
      entered.resolve()
      return operation.promise
    })
    const responsePending = coordinator.fetch(callbackRequest(mode, token))
    await entered.promise
    expect((await coordinator.status(input.runId))?.updatedAt).toBe(200)
    now.mockReturnValue(300)
    operation.resolve(operationResult)
    const response = await responsePending
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(
      mode === 'do-drives' ? operationResult : { result: operationResult },
    )
    expect((await coordinator.status(input.runId))?.updatedAt).toBe(300)
  })
})
