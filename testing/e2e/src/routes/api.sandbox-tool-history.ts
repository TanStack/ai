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
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'
import type { SandboxHandle, SandboxProvider } from '@tanstack/ai-sandbox'

/**
 * A FINISHED sandbox run must restore its tool cards from the message store.
 *
 * A harness executes its tools inside the sandbox, so `chat()` only relays their
 * `TOOL_CALL_*` chunks — it writes no assistant message for them. Before this, the
 * tool history existed only in the delivery log: switching away and back replayed it
 * (there was a live run to rejoin), while a reload AFTER the run finished hydrated
 * from the message store and got nothing but the prompt and the final answer.
 *
 * This route runs a fake harness to completion and then answers a hydration GET the
 * same way an app does — through `reconstructChat`, which is what a
 * `persistence: true` client calls on mount. So the spec asserts on the exact JSON
 * the browser would receive.
 *
 * Provider-free: fixed AG-UI stream plus a fake sandbox provider (exempt from the
 * aimock policy — nothing reaches an LLM's HTTP layer).
 */

const persistence = memoryPersistence()
const instances = new InMemorySandboxInstanceStore()
const locks = new InMemoryLockStore()

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
  create: (input) => Promise.resolve(fakeHandle(input.id ?? 'fake-sandbox')),
  resume: (input) => Promise.resolve(fakeHandle(input.id)),
  destroy: () => Promise.resolve(),
}

const sandbox = defineSandbox({
  id: 'tool-history',
  provider,
  workspace: defineWorkspace({ source: { type: 'none' } }),
  fileEvents: false,
})

const VERDICT = 'TOOL_HISTORY_OK the lighthouse still turns.'

/**
 * What a harness emits: text, then a tool call with streamed arguments and a
 * result, then more text. The tool call is PASSTHROUGH — the harness already ran it
 * inside the sandbox, so the engine must not try to execute anything.
 */
function harnessRun(
  threadId: string,
  runId: string,
): AsyncIterable<StreamChunk> {
  const base = { threadId, runId, timestamp: 1 }
  return (async function* () {
    yield { type: EventType.RUN_STARTED, ...base }
    yield {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'm1',
      role: 'assistant',
      ...base,
    }
    yield {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'm1',
      delta: 'Looking at the repo. ',
      ...base,
    }
    yield { type: EventType.TEXT_MESSAGE_END, messageId: 'm1', ...base }
    yield {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'call-1',
      toolCallName: 'bash',
      toolName: 'bash',
      ...base,
    }
    yield {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'call-1',
      delta: '{"cmd":"ls packages"}',
      ...base,
    }
    yield { type: EventType.TOOL_CALL_END, toolCallId: 'call-1', ...base }
    yield {
      type: EventType.TOOL_CALL_RESULT,
      messageId: 'tr-1',
      toolCallId: 'call-1',
      content: 'ai\nai-client\nai-sandbox',
      ...base,
    }
    yield {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'm2',
      role: 'assistant',
      ...base,
    }
    yield {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'm2',
      delta: VERDICT,
      ...base,
    }
    yield { type: EventType.TEXT_MESSAGE_END, messageId: 'm2', ...base }
    yield { type: EventType.RUN_FINISHED, finishReason: 'stop', ...base }
  })()
}

const adapter: AnyTextAdapter = {
  kind: 'text',
  name: 'fixed',
  model: 'test-model',
  '~types': {},
  chatStream: ({ runId, threadId }: { runId: string; threadId: string }) =>
    harnessRun(threadId, runId),
  structuredOutput: () => Promise.resolve({ data: {}, rawText: '{}' }),
} as unknown as AnyTextAdapter

function stringField(body: unknown, key: string): string | undefined {
  if (typeof body !== 'object' || body === null || !(key in body)) {
    return undefined
  }
  const value: unknown = (body as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : undefined
}

export const Route = createFileRoute('/api/sandbox-tool-history')({
  server: {
    handlers: {
      // Run the harness to completion, draining the stream server-side: this is the
      // "the run finished and nobody is tailing it any more" state a later reload
      // lands in.
      POST: async ({ request }) => {
        const body: unknown = await request.json()
        const threadId = stringField(body, 'threadId') ?? 'tool-history-thread'
        const runId = stringField(body, 'runId') ?? crypto.randomUUID()

        const stream = chat({
          adapter,
          messages: [{ role: 'user', content: 'Triage this' }],
          runId,
          threadId,
          middleware: [
            withPersistence(persistence),
            withLocks(locks),
            withSandbox(sandbox, { instances }),
          ],
        })
        for await (const _ of stream) void _

        return Response.json({ runId, threadId })
      },

      // Mount hydration, exactly as a `persistence: true` client issues it.
      GET: ({ request }) =>
        reconstructChat(persistence, request, {
          authorize: (threadId) => threadId.length > 0,
        }),
    },
  },
})
