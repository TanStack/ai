/**
 * A successor host must save the same transcript as a run that never restarted.
 *
 * Alignment used to drop the stored prefix inside the adapter, before `chat()`
 * and `withSandbox` could record it. The live log was already correct. The
 * saved thread was not: the first host's text and tool calls were gone, and a
 * tool result that arrived after the cut was left with no call.
 */
import { describe, expect, it } from 'vitest'
import { EventType, InMemoryRunStore, chat } from '@tanstack/ai'
import { memoryPersistence, withPersistence } from '@tanstack/ai-persistence'
import { defineSandbox } from '../src/sandbox'
import { withSandbox } from '../src/middleware'
import { alignedIfAttaching, getSandboxDurability } from '../src/durability'
import { pipeToRunLog } from '../src/run'
import { InMemorySandboxInstanceStore } from '../src/instance-store'
import { FULL_CAPS, fakeLog, fromChunkValues, makeFakeHandle } from './fakes'
import type {
  AnyTextAdapter,
  ModelMessage,
  StreamChunk,
  StreamDurability,
} from '@tanstack/ai'
import type { SandboxProvider } from '../src/contracts'

function fakeProvider(): SandboxProvider {
  return {
    name: 'fake',
    capabilities: () => FULL_CAPS,
    create: () => Promise.resolve(makeFakeHandle('sbx', 'fake', FULL_CAPS)),
    resume: () => Promise.resolve(makeFakeHandle('sbx', 'fake', FULL_CAPS)),
    destroy: () => Promise.resolve(),
  }
}

function stamp(
  runId: string,
  threadId: string,
  chunk: StreamChunk,
): StreamChunk {
  return { ...chunk, runId, threadId, timestamp: 1 }
}

/** One harness reply: opening text, a bash call, its result, then the close. */
function jobChunks(runId: string, threadId: string): Array<StreamChunk> {
  const at = (chunk: StreamChunk) => stamp(runId, threadId, chunk)
  return [
    at({ type: EventType.RUN_STARTED, runId, threadId }),
    at({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'open',
      role: 'assistant',
    }),
    at({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'open',
      delta: 'Starting the job.',
    }),
    at({ type: EventType.TEXT_MESSAGE_END, messageId: 'open' }),
    at({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'bash-1',
      toolCallName: 'bash',
    }),
    at({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'bash-1',
      delta: '{"cmd":"sleep"}',
    }),
    at({ type: EventType.TOOL_CALL_END, toolCallId: 'bash-1' }),
    at({
      type: EventType.TOOL_CALL_RESULT,
      messageId: 'bash-1-result',
      toolCallId: 'bash-1',
      content: 'done',
    }),
    at({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'close',
      role: 'assistant',
    }),
    at({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'close',
      delta: 'Finished.',
    }),
    at({ type: EventType.TEXT_MESSAGE_END, messageId: 'close' }),
    at({
      type: EventType.RUN_FINISHED,
      runId,
      threadId,
      finishReason: 'stop',
    }),
  ]
}

/** The bash call is cut between two argument deltas. */
function splitChunks(runId: string, threadId: string): Array<StreamChunk> {
  const at = (chunk: StreamChunk) => stamp(runId, threadId, chunk)
  return [
    at({ type: EventType.RUN_STARTED, runId, threadId }),
    at({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'bash-1',
      toolCallName: 'bash',
    }),
    at({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'bash-1',
      delta: '{"cmd":',
    }),
    at({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'bash-1',
      delta: '"sleep"}',
    }),
    at({ type: EventType.TOOL_CALL_END, toolCallId: 'bash-1' }),
    at({
      type: EventType.TOOL_CALL_RESULT,
      messageId: 'bash-1-result',
      toolCallId: 'bash-1',
      content: 'done',
    }),
    at({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'close',
      role: 'assistant',
    }),
    at({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'close',
      delta: 'Finished.',
    }),
    at({ type: EventType.TEXT_MESSAGE_END, messageId: 'close' }),
    at({
      type: EventType.RUN_FINISHED,
      runId,
      threadId,
      finishReason: 'stop',
    }),
  ]
}

function textDeltas(chunks: ReadonlyArray<StreamChunk>): Array<string> {
  return chunks.flatMap((chunk) =>
    chunk.type === EventType.TEXT_MESSAGE_CONTENT &&
    typeof chunk.delta === 'string'
      ? [chunk.delta]
      : [],
  )
}

/** Role, text, and tool cards. Ids and timestamps differ between two runs. */
function outline(messages: ReadonlyArray<ModelMessage>) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content ?? null,
    ...(message.role === 'tool' ? { toolCallId: message.toolCallId } : {}),
    ...(message.toolCalls
      ? {
          toolCalls: message.toolCalls.map((call) => ({
            id: call.id,
            name: call.function.name,
            arguments: call.function.arguments,
          })),
        }
      : {}),
  }))
}

function harness(chunks: Array<StreamChunk>): AnyTextAdapter {
  return {
    kind: 'text',
    name: 'fixed',
    model: 'test-model',
    '~types': {},
    chatStream: (options: {
      runId?: string
      threadId?: string
      capabilities?: Parameters<typeof getSandboxDurability>[0]
    }) => {
      const durability = options.capabilities
        ? getSandboxDurability(options.capabilities, { optional: true })
        : undefined
      return alignedIfAttaching(fromChunkValues(chunks), durability)
    },
    structuredOutput: () => Promise.resolve({ data: {}, rawText: '{}' }),
  } as unknown as AnyTextAdapter
}

async function drive(input: {
  chunks: Array<StreamChunk>
  /** Chunks the first host already appended. Empty for a run that did not restart. */
  stored: number
  attach: boolean
  threadId: string
  runId: string
}): Promise<{
  saved: ReadonlyArray<ModelMessage>
  live: Array<StreamChunk>
  log: Array<StreamChunk>
}> {
  const log = fakeLog(input.chunks.slice(0, input.stored))
  const runs = new InMemoryRunStore()
  const persistence = memoryPersistence()
  const sandbox = withSandbox(
    defineSandbox({
      id: 's',
      provider: fakeProvider(),
      lifecycle: { snapshot: 'none' },
      fileEvents: false,
    }),
    {
      instances: new InMemorySandboxInstanceStore(),
      runs,
      durability: { adapter: log, attach: input.attach },
    },
  )
  const live: Array<StreamChunk> = []
  async function* tee(
    source: AsyncIterable<StreamChunk>,
  ): AsyncIterable<StreamChunk> {
    for await (const chunk of source) {
      live.push(chunk)
      yield chunk
    }
  }
  await pipeToRunLog(
    tee(
      chat({
        adapter: harness(input.chunks),
        messages: [{ role: 'user', content: 'go' }],
        threadId: input.threadId,
        runId: input.runId,
        middleware: [withPersistence(persistence), sandbox],
      }),
    ),
    {
      runs,
      runId: input.runId,
      threadId: input.threadId,
      durability: () => log as StreamDurability,
    },
  )
  return {
    saved: await persistence.stores.messages.loadThread(input.threadId),
    live,
    log: (await log.snapshot()).map((entry) => entry.chunk),
  }
}

describe('sandbox takeover transcript', () => {
  it('keeps the first host text and the bash call in the saved thread', async () => {
    const freshChunks = jobChunks('run-fresh', 'thread-fresh')
    const fresh = await drive({
      chunks: freshChunks,
      stored: 0,
      attach: false,
      threadId: 'thread-fresh',
      runId: 'run-fresh',
    })
    const takeoverChunks = jobChunks('run-take', 'thread-take')
    // Through TOOL_CALL_END: the opening text and the complete bash call.
    const takeover = await drive({
      chunks: takeoverChunks,
      stored: 7,
      attach: true,
      threadId: 'thread-take',
      runId: 'run-take',
    })

    expect(outline(takeover.saved)).toEqual(outline(fresh.saved))
    expect(JSON.stringify(outline(takeover.saved))).toContain(
      'Starting the job.',
    )
    expect(outline(takeover.saved)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          toolCalls: [
            {
              id: 'bash-1',
              name: 'bash',
              arguments: '{"cmd":"sleep"}',
            },
          ],
        }),
      ]),
    )
    // The client tails the log. The public chat stream is only the rest.
    expect(textDeltas(takeover.live)).toEqual(['Finished.'])
    expect(textDeltas(takeover.log)).toEqual(['Starting the job.', 'Finished.'])
    expect(takeover.log).toHaveLength(takeover.live.length + 7)
  })

  it('joins tool arguments that were cut across the takeover', async () => {
    const fresh = await drive({
      chunks: splitChunks('run-fresh-split', 'thread-fresh-split'),
      stored: 0,
      attach: false,
      threadId: 'thread-fresh-split',
      runId: 'run-fresh-split',
    })
    // RUN_STARTED, TOOL_CALL_START, and the first ARGS delta are already stored.
    const takeover = await drive({
      chunks: splitChunks('run-take-split', 'thread-take-split'),
      stored: 3,
      attach: true,
      threadId: 'thread-take-split',
      runId: 'run-take-split',
    })

    expect(outline(takeover.saved)).toEqual(outline(fresh.saved))
    expect(outline(takeover.saved)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          toolCalls: [
            {
              id: 'bash-1',
              name: 'bash',
              arguments: '{"cmd":"sleep"}',
            },
          ],
        }),
      ]),
    )
    expect(textDeltas(takeover.live)).toEqual(['Finished.'])
  })
})
