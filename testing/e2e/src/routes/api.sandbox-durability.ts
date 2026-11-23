import { createFileRoute } from '@tanstack/react-router'
import { EventType, chat } from '@tanstack/ai'
import { InMemoryLockStore, withLocks } from '@tanstack/ai/locks'
import {
  memoryPersistence,
  reconstructChat,
  withPersistence,
} from '@tanstack/ai-persistence'
import {
  InMemorySandboxInstanceStore,
  defineSandbox,
  defineWorkspace,
  withSandbox,
} from '@tanstack/ai-sandbox'
import type {
  ActivitySnapshotEvent,
  AnyTextAdapter,
  StreamChunk,
} from '@tanstack/ai'
import type { SandboxHandle, SandboxProvider } from '@tanstack/ai-sandbox'

/**
 * Server-side sandbox instance durability harness.
 *
 * Proves that a durable `SandboxInstanceStore` (module-singleton stand-in for a
 * BYO backend) makes resume durable ACROSS independent runs: each POST is a
 * fresh `chat()` with a brand-new middleware context; the only shared state the
 * resume reads is the instance store. A second run for the same `threadId`
 * must RESUME the sandbox the first run created.
 *
 * Wired as production apps do: `withLocks` plus the instance store handed
 * straight to `withSandbox`. The resume does not need chat persistence.
 * `withPersistence` stores the user message and the `sandbox.status` activity
 * row of each run. The response returns the rows as `storedActivities`, and
 * the thread as a reload shows it as `reloadOrder`. With `failBoot: true`,
 * the sandbox start throws, and the response still returns both.
 *
 * Provider-free: fixed AG-UI stream + fake sandbox provider (exempt from aimock).
 */

const persistence = memoryPersistence()
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
      killableProcesses: false,
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

/** The same sandbox, but its start throws. A run with `failBoot` uses it. */
const failingSandbox = defineSandbox({
  id: 'durable',
  provider: {
    ...provider,
    create: () => Promise.reject(new Error('sandbox boot failed')),
    resume: () => Promise.reject(new Error('sandbox boot failed')),
  },
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
        const failBoot =
          typeof body === 'object' &&
          body !== null &&
          'failBoot' in body &&
          body.failBoot === true

        const stream = chat({
          adapter,
          // Like a client with history paging: only the new message.
          messages: [{ id: `user-${runId}`, role: 'user', content: 'go' }],
          runId,
          threadId,
          middleware: [
            withPersistence(persistence),
            withLocks(locks),
            withSandbox(failBoot ? failingSandbox : sandbox, {
              instances: instanceStore,
            }),
          ],
        })
        // Lifecycle events and RUN_STARTED, in stream order.
        const events: Array<string> = []
        // The ACTIVITY_SNAPSHOT chunks of this run, in stream order.
        const activities: Array<
          Pick<ActivitySnapshotEvent, 'messageId' | 'activityType' | 'content'>
        > = []
        try {
          for await (const chunk of stream) {
            if (chunk.type === EventType.RUN_STARTED) events.push('RUN_STARTED')
            else if (
              chunk.type === EventType.CUSTOM &&
              chunk.name.startsWith('sandbox.')
            )
              events.push(chunk.name)
            else if (chunk.type === EventType.ACTIVITY_SNAPSHOT)
              activities.push({
                messageId: chunk.messageId,
                activityType: chunk.activityType,
                content: chunk.content,
              })
          }
        } catch (error) {
          // A `failBoot` run fails in setup. Answer with the stored rows.
          if (!failBoot) throw error
        }

        const key = sandbox.key({ threadId, runId })
        const record = await instanceStore.get(key)
        const countKey = record?.providerSandboxId ?? key
        const reloaded = (await (
          await reconstructChat(
            persistence,
            new Request(`http://e2e.test/api/chat?threadId=${threadId}`),
          )
        ).json()) as { messages: Array<{ id: string }> }
        return Response.json({
          reloadOrder: reloaded.messages.map((message) => message.id),
          create: createCountByKey.get(countKey) ?? 0,
          resume: resumeCountByKey.get(countKey) ?? 0,
          providerSandboxId: record?.providerSandboxId ?? null,
          latestRunId: record?.latestRunId ?? null,
          events,
          activities,
          storedActivities:
            await persistence.stores.activities.loadActivities(threadId),
        })
      },
    },
  },
})
