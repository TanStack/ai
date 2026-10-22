import { describe, expect, it } from 'vitest'
import { EventType, chat, toolDefinition } from '@tanstack/ai'
import {
  InMemorySandboxInstanceStore,
  SandboxCapability,
  defineSandbox,
  defineWorkspace,
  withSandbox,
} from '../src'
import { FULL_CAPS, makeFakeProvider } from './fakes'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'
import type { SandboxHandle } from '../src'

const base = { threadId: 'thread-1', timestamp: 1 }

/** First model call asks for `whereAmI`, the second answers. */
function toolThenAnswer(): AnyTextAdapter {
  let call = 0
  const turns: Array<Array<StreamChunk>> = [
    [
      { type: EventType.RUN_STARTED, runId: 'run-1', ...base },
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: 'call-1',
        toolCallName: 'whereAmI',
        timestamp: 1,
      },
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: 'call-1',
        delta: '{}',
        timestamp: 1,
      },
      { type: EventType.TOOL_CALL_END, toolCallId: 'call-1', timestamp: 1 },
      {
        type: EventType.RUN_FINISHED,
        runId: 'run-1',
        finishReason: 'tool_calls',
        ...base,
      },
    ],
    [
      { type: EventType.RUN_STARTED, runId: 'run-1', ...base },
      {
        type: EventType.RUN_FINISHED,
        runId: 'run-1',
        finishReason: 'stop',
        ...base,
      },
    ],
  ]
  const adapter: AnyTextAdapter = {
    kind: 'text',
    name: 'mock',
    model: 'test-model',
    '~types': {
      providerOptions: undefined,
      inputModalities: undefined,
      toolCapabilities: undefined,
      toolCallMetadata: undefined,
      systemPromptMetadata: undefined,
      messageMetadataByModality: undefined,
    },
    chatStream: async function* () {
      for (const chunk of turns[call++] ?? []) yield chunk
    },
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
  }
  return adapter
}

describe('withSandbox + a server tool', () => {
  it('the tool reads the sandbox with context.get(SandboxCapability)', async () => {
    const provider = makeFakeProvider({ caps: FULL_CAPS })
    const sandbox = defineSandbox({
      id: 'repo',
      provider,
      workspace: defineWorkspace({ source: { type: 'none' } }),
      fileEvents: false,
    })
    let seen: SandboxHandle | undefined
    const whereAmI = toolDefinition({
      name: 'whereAmI',
      description: 'Return the sandbox id',
      inputSchema: { type: 'object', properties: {} },
    }).server((_args, context) => {
      seen = context?.get?.(SandboxCapability)
      return seen?.id ?? 'none'
    })

    const stream = chat({
      adapter: toolThenAnswer(),
      messages: [{ role: 'user', content: 'hi' }],
      runId: 'run-1',
      threadId: 'thread-1',
      tools: [whereAmI],
      middleware: [
        withSandbox(sandbox, { instances: new InMemorySandboxInstanceStore() }),
      ],
    })
    for await (const _chunk of stream) void _chunk

    expect(provider.created).toHaveLength(1)
    expect(seen).toBe(provider.created[0])
  })
})
