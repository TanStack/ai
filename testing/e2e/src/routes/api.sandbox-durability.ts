import { createFileRoute } from '@tanstack/react-router'
import { EventType, chat } from '@tanstack/ai'
import { InMemoryLockStore, withLocks } from '@tanstack/ai/locks'
import {
  InMemorySandboxInstanceStore,
  defineSandbox,
  defineWorkspace,
  withSandbox,
} from '@tanstack/ai-sandbox'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'
import type { SandboxHandle, SandboxProvider } from '@tanstack/ai-sandbox'

/**
 * Server-side sandbox instance durability harness.
 *
 * Proves that a durable `SandboxInstanceStore` (module-singleton stand-in for a
 * BYO backend) makes resume durable ACROSS independent runs: each POST is a
 * fresh `chat()` with a brand-new middleware context; the only shared state is
 * the instance store. A second run for the same `threadId` must RESUME the
 * sandbox the first run created.
 *
 * Wired as production apps do: `withLocks` plus the instance store handed
 * straight to `withSandbox`. No chat persistence required.
 *
 * Provider-free: fixed AG-UI stream + fake sandbox provider (exempt from aimock).
 */

const instanceStore = new InMemorySandboxInstanceStore()
const locks = new InMemoryLockStore()

/** Per compound sandbox key — isolates concurrent / leftover threads. */
const createCountByKey = new Map<string, number>()
const resumeCountByKey = new Map<string, number>()

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1)
}

function fakeHandle(id: string): SandboxHandle {
  return {
    id,
    provider: 'fake',
    capabilities: {
      fs: true,
      exec: true,
      env: true,
      ports: false,
      backgroundProcesses: false,
      writableStdin: false,
      snapshots: false,
      networkPolicy: false,
      durableFilesystem: false,
      fork: false,
    },
    fs: {
      read: () => Promise.resolve(''),
      readBytes: () => Promise.resolve(new Uint8Array()),
      write: () => Promise.resolve(),
      list: () => Promise.resolve([]),
      mkdir: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      rename: () => Promise.resolve(),
      exists: () => Promise.resolve(false),
    },
    git: {
      clone: () => Promise.resolve(),
      status: () => Promise.resolve(''),
      add: () => Promise.resolve(),
      commit: () => Promise.resolve(),
      push: () => Promise.resolve(),
      pull: () => Promise.resolve(),
      branch: () => Promise.resolve('main'),
    },
    process: {
      exec: () => Promise.resolve({ stdout: '', stderr: '', exitCode: 0 }),
      spawn: () => Promise.reject(new Error('not supported')),
    },
    ports: { connect: () => Promise.reject(new Error('not supported')) },
    env: { set: () => Promise.resolve() },
    destroy: () => Promise.resolve(),
  }
}

const provider: SandboxProvider = {
  name: 'fake',
  capabilities: () => fakeHandle('probe').capabilities,
  create: (input) => {
    const id = input.id ?? 'fake-sandbox'
    bump(createCountByKey, id)
    return Promise.resolve(fakeHandle(id))
  },
  resume: (input) => {
    bump(resumeCountByKey, input.id)
    return Promise.resolve(fakeHandle(input.id))
  },
  destroy: () => Promise.resolve(),
}

const sandbox = defineSandbox({
  id: 'durable',
  provider,
  workspace: defineWorkspace({ source: { type: 'none' } }),
  fileEvents: false,
})

function fixedRun(threadId: string, runId: string): AsyncIterable<StreamChunk> {
  return (async function* () {
    yield { type: EventType.RUN_STARTED, threadId, runId, timestamp: 1 }
    yield {
      type: EventType.RUN_FINISHED,
      threadId,
      runId,
      finishReason: 'stop',
      timestamp: 1,
    }
  })()
}

const adapter: AnyTextAdapter = {
  kind: 'text',
  name: 'fixed',
  model: 'test-model',
  '~types': {},
  chatStream: ({ runId, threadId }: { runId: string; threadId: string }) =>
    fixedRun(threadId, runId),
  structuredOutput: () => Promise.resolve({ data: {}, rawText: '{}' }),
} as unknown as AnyTextAdapter

function stringField(body: unknown, key: string): string | undefined {
  if (typeof body !== 'object' || body === null || !(key in body)) {
    return undefined
  }
  const value: unknown = (body as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

export const Route = createFileRoute('/api/sandbox-durability')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body: unknown = await request.json()
        const threadId = stringField(body, 'threadId') ?? 'sandbox-thread'
        const runId = stringField(body, 'runId') ?? crypto.randomUUID()

        const stream = chat({
          adapter,
          messages: [{ role: 'user', content: 'go' }],
          runId,
          threadId,
          middleware: [
            withLocks(locks),
            withSandbox(sandbox, { instances: instanceStore }),
          ],
        })
        for await (const _ of stream) void _

        const key = sandbox.key({ threadId, runId })
        const record = await instanceStore.get(key)
        const countKey = record?.providerSandboxId ?? key
        return Response.json({
          create: createCountByKey.get(countKey) ?? 0,
          resume: resumeCountByKey.get(countKey) ?? 0,
          providerSandboxId: record?.providerSandboxId ?? null,
          latestRunId: record?.latestRunId ?? null,
        })
      },
    },
  },
})
