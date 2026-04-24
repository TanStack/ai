import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import {
  OllamaTextAdapter,
  createOllamaChat,
  ollamaText,
} from '../src/adapters/text'
import type { Mock } from 'vitest'
import type { StreamChunk, Tool } from '@tanstack/ai'

const testLogger = resolveDebugOption(false)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let chatMock: Mock<(...args: Array<any>) => any>
let ollamaConstructorCalls: Array<{ host?: string } | undefined>

vi.mock('ollama', () => {
  class Ollama {
    chat: (...args: Array<unknown>) => unknown
    constructor(config?: { host?: string }) {
      ollamaConstructorCalls.push(config)
      this.chat = (...args) => chatMock(...args)
    }
  }
  return { Ollama }
})

async function* asyncIterable<T>(chunks: Array<T>): AsyncIterable<T> {
  for (const c of chunks) yield c
}

async function collectStream(
  iter: AsyncIterable<StreamChunk>,
): Promise<Array<StreamChunk>> {
  const out: Array<StreamChunk> = []
  for await (const c of iter) out.push(c)
  return out
}

const searchTool: Tool = {
  name: 'search',
  description: 'search the web',
  inputSchema: {
    type: 'object',
    properties: { q: { type: 'string' } },
    required: ['q'],
  },
}

beforeEach(() => {
  chatMock = vi.fn()
  ollamaConstructorCalls = []
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('OllamaTextAdapter construction', () => {
  it('createOllamaChat wires kind=text, name=ollama, and the given model', () => {
    const adapter = createOllamaChat('llama3.2')
    expect(adapter.kind).toBe('text')
    expect(adapter.name).toBe('ollama')
    expect(adapter.model).toBe('llama3.2')
  })

  it('createOllamaChat accepts a string host', () => {
    const adapter = createOllamaChat('llama3.2', 'http://remote:11434')
    expect(adapter).toBeInstanceOf(OllamaTextAdapter)
  })

  it('createOllamaChat accepts a config object', () => {
    const adapter = createOllamaChat('llama3.2', {
      host: 'http://remote:11434',
      headers: { Authorization: 'Bearer x' },
    })
    expect(adapter).toBeInstanceOf(OllamaTextAdapter)
  })

  it('ollamaText reads OLLAMA_HOST from env and forwards it to the Ollama client', () => {
    vi.stubEnv('OLLAMA_HOST', 'http://from-env:11434')
    const adapter = ollamaText('llama3.2')
    expect(adapter.model).toBe('llama3.2')
    // The adapter must instantiate the Ollama client with the env-derived host —
    // asserting only on adapter.model would pass even if OLLAMA_HOST were ignored.
    expect(ollamaConstructorCalls).toContainEqual(
      expect.objectContaining({ host: 'http://from-env:11434' }),
    )
  })
})

describe('OllamaTextAdapter.chatStream (content streaming)', () => {
  it('emits RUN_STARTED, a TEXT_MESSAGE lifecycle, and RUN_FINISHED for a plain text reply', async () => {
    chatMock.mockResolvedValueOnce(
      asyncIterable([
        {
          message: { role: 'assistant', content: 'Hello ' },
          done: false,
        },
        {
          message: { role: 'assistant', content: 'world' },
          done: false,
        },
        {
          message: { role: 'assistant', content: '' },
          done: true,
          done_reason: 'stop',
        },
      ]),
    )

    const adapter = createOllamaChat('llama3.2')
    const chunks = await collectStream(
      adapter.chatStream({
        logger: testLogger,
        model: 'llama3.2',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    )

    const types = chunks.map((c) => c.type)
    expect(types).toContain('RUN_STARTED')
    expect(types).toContain('TEXT_MESSAGE_START')
    expect(types).toContain('TEXT_MESSAGE_CONTENT')
    expect(types).toContain('TEXT_MESSAGE_END')
    expect(types).toContain('RUN_FINISHED')

    const contents = chunks
      .filter((c) => c.type === 'TEXT_MESSAGE_CONTENT')
      .map((c) => (c as { delta: string }).delta)
      .join('')
    expect(contents).toContain('Hello')
    expect(contents).toContain('world')
  })
})

describe('OllamaTextAdapter.chatStream (tool calls)', () => {
  it('emits TOOL_CALL lifecycle events when Ollama returns a tool call', async () => {
    chatMock.mockResolvedValueOnce(
      asyncIterable([
        {
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'tc-123',
                function: {
                  name: 'search',
                  arguments: { q: 'cats' },
                },
              },
            ],
          },
          done: false,
        },
        {
          message: { role: 'assistant', content: '' },
          done: true,
          done_reason: 'stop',
        },
      ]),
    )

    const adapter = createOllamaChat('llama3.2')
    const chunks = await collectStream(
      adapter.chatStream({
        logger: testLogger,
        model: 'llama3.2',
        messages: [{ role: 'user', content: 'find cats' }],
        tools: [searchTool],
      }),
    )

    const types = chunks.map((c) => c.type)
    expect(types).toContain('TOOL_CALL_START')
    expect(types).toContain('TOOL_CALL_ARGS')
    expect(types).toContain('TOOL_CALL_END')

    const startChunk = chunks.find((c) => c.type === 'TOOL_CALL_START') as
      | { toolName: string; toolCallId: string }
      | undefined
    expect(startChunk!.toolName).toBe('search')
    expect(startChunk!.toolCallId).toBe('tc-123')
  })

  it('synthesises a tool-call id when Ollama omits one', async () => {
    chatMock.mockResolvedValueOnce(
      asyncIterable([
        {
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                function: { name: 'search', arguments: { q: 'x' } },
              },
            ],
          },
          done: false,
        },
        {
          message: { role: 'assistant', content: '' },
          done: true,
          done_reason: 'stop',
        },
      ]),
    )

    const adapter = createOllamaChat('llama3.2')
    const chunks = await collectStream(
      adapter.chatStream({
        logger: testLogger,
        model: 'llama3.2',
        messages: [{ role: 'user', content: 'find' }],
        tools: [searchTool],
      }),
    )
    const startChunk = chunks.find((c) => c.type === 'TOOL_CALL_START') as
      | { toolCallId: string; toolName: string }
      | undefined
    expect(startChunk!.toolCallId).toMatch(/^search_\d+/)
  })

  it('forwards tools to the ollama client in provider format', async () => {
    chatMock.mockResolvedValueOnce(
      asyncIterable([
        {
          message: { role: 'assistant', content: '' },
          done: true,
          done_reason: 'stop',
        },
      ]),
    )

    const adapter = createOllamaChat('llama3.2')
    await collectStream(
      adapter.chatStream({
        logger: testLogger,
        model: 'llama3.2',
        messages: [{ role: 'user', content: 'hi' }],
        tools: [searchTool],
      }),
    )

    expect(chatMock).toHaveBeenCalledOnce()
    const call = chatMock.mock.calls[0]![0] as {
      tools?: Array<{ type: string; function: { name: string } }>
      stream?: boolean
    }
    expect(call.stream).toBe(true)
    expect(call.tools).toHaveLength(1)
    expect(call.tools![0]!.type).toBe('function')
    expect(call.tools![0]!.function.name).toBe('search')
  })

  it('omits the tools field when no tools are provided', async () => {
    chatMock.mockResolvedValueOnce(
      asyncIterable([
        {
          message: { role: 'assistant', content: 'ok' },
          done: true,
          done_reason: 'stop',
        },
      ]),
    )
    const adapter = createOllamaChat('llama3.2')
    await collectStream(
      adapter.chatStream({
        logger: testLogger,
        model: 'llama3.2',
        messages: [{ role: 'user', content: 'hi' }],
      }),
    )
    const call = chatMock.mock.calls[0]![0] as { tools?: unknown }
    expect(call.tools).toBeUndefined()
  })
})

describe('OllamaTextAdapter.structuredOutput', () => {
  it('returns parsed JSON and the raw text', async () => {
    chatMock.mockResolvedValueOnce({
      message: { role: 'assistant', content: '{"result":42}' },
    })
    const adapter = createOllamaChat('llama3.2')
    const result = await adapter.structuredOutput({
      chatOptions: {
        logger: testLogger,
        messages: [{ role: 'user', content: 'q' }],
      },
      outputSchema: {
        type: 'object',
        properties: { result: { type: 'number' } },
      },
    } as any)
    expect(result.data).toEqual({ result: 42 })
    expect(result.rawText).toBe('{"result":42}')
  })

  it('wraps a JSON parse failure in an informative error', async () => {
    chatMock.mockResolvedValueOnce({
      message: { role: 'assistant', content: 'not json' },
    })
    const adapter = createOllamaChat('llama3.2')
    await expect(
      adapter.structuredOutput({
        chatOptions: {
          logger: testLogger,
          messages: [{ role: 'user', content: 'q' }],
        },
        outputSchema: { type: 'object', properties: {} },
      } as any),
    ).rejects.toThrow(/Failed to parse structured output/)
  })

  it('surfaces upstream errors as structured-output errors', async () => {
    chatMock.mockRejectedValueOnce(new Error('network down'))
    const adapter = createOllamaChat('llama3.2')
    await expect(
      adapter.structuredOutput({
        chatOptions: {
          logger: testLogger,
          messages: [{ role: 'user', content: 'q' }],
        },
        outputSchema: { type: 'object', properties: {} },
      } as any),
    ).rejects.toThrow(/Structured output generation failed.*network down/)
  })
})
