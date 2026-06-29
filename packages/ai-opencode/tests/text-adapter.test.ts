import { beforeEach, describe, expect, it, vi } from 'vitest'
import { opencodeText } from '../src/adapters/text'
import { startOpencodeSession } from '../src/process/server'
import { startToolBridge } from '../src/tools/bridge'
import type {
  OpencodeAssistantMessage,
  OpencodeEvent,
} from '../src/stream/sdk-types'
import type { StartOpencodeSessionOptions } from '../src/process/server'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { StreamChunk, TextOptions } from '@tanstack/ai'

vi.mock('../src/process/server', () => ({ startOpencodeSession: vi.fn() }))
vi.mock('../src/tools/bridge', () => ({ startToolBridge: vi.fn() }))

const startSessionMock = vi.mocked(startOpencodeSession)
const bridgeMock = vi.mocked(startToolBridge)
const promptMock = vi.fn()
const abortMock = vi.fn()
const disposeMock = vi.fn()
const bridgeCloseMock = vi.fn()

let captured: StartOpencodeSessionOptions | undefined

const MODEL = 'anthropic/claude-sonnet-4-5'

function textTurn(text = 'hi there'): {
  message: OpencodeAssistantMessage
  text: string
} {
  captured?.onEvent({
    type: 'message.part.updated',
    properties: {
      part: { id: 'p1', sessionID: 's', type: 'text', text },
      delta: text,
    },
  } as OpencodeEvent)
  return {
    message: {
      id: 'm1',
      role: 'assistant',
      finish: 'stop',
      tokens: { input: 10, output: 5 },
    },
    text,
  }
}

const noopLogger = {
  request: vi.fn(),
  provider: vi.fn(),
  output: vi.fn(),
  errors: vi.fn(),
  middleware: vi.fn(),
  tools: vi.fn(),
  agentLoop: vi.fn(),
  config: vi.fn(),
  isEnabled: () => false,
} as unknown as InternalLogger

function makeOptions(
  overrides: Partial<TextOptions<Record<string, any>>> = {},
): TextOptions<Record<string, any>> {
  return {
    model: MODEL,
    messages: [{ role: 'user', content: 'hello' }],
    logger: noopLogger,
    ...overrides,
  } as TextOptions<Record<string, any>>
}

async function collect(
  stream: AsyncIterable<StreamChunk>,
): Promise<Array<StreamChunk>> {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of stream) chunks.push(chunk)
  return chunks
}

beforeEach(() => {
  captured = undefined
  startSessionMock.mockReset()
  bridgeMock.mockReset()
  promptMock.mockReset()
  abortMock.mockReset()
  disposeMock.mockReset()
  bridgeCloseMock.mockReset()

  abortMock.mockResolvedValue(undefined)
  disposeMock.mockResolvedValue(undefined)
  bridgeCloseMock.mockResolvedValue(undefined)
  bridgeMock.mockResolvedValue({
    url: 'http://127.0.0.1:54321/mcp',
    close: bridgeCloseMock,
  })
  promptMock.mockImplementation(() => Promise.resolve(textTurn()))

  startSessionMock.mockImplementation(
    async (options: StartOpencodeSessionOptions) => {
      captured = options
      return {
        sessionId: options.resumeSessionId ?? 'sess-new',
        resumed: options.resumeSessionId !== undefined,
        prompt: promptMock,
        abort: abortMock,
        dispose: disposeMock,
      }
    },
  )
})

describe('opencodeText', () => {
  it('creates an adapter with the opencode provider name', () => {
    const adapter = opencodeText(MODEL)
    expect(adapter.kind).toBe('text')
    expect(adapter.name).toBe('opencode')
    expect(adapter.model).toBe(MODEL)
  })
})

describe('chatStream', () => {
  it('streams translated AG-UI events for a simple turn', async () => {
    const chunks = await collect(opencodeText(MODEL).chatStream(makeOptions()))
    expect(chunks.map((c) => c.type)).toEqual([
      'RUN_STARTED',
      'CUSTOM',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'RUN_FINISHED',
    ])
    expect(chunks.at(-1)).toMatchObject({ finishReason: 'stop' })
  })

  it('splits the provider/model id for the session', async () => {
    await collect(opencodeText(MODEL).chatStream(makeOptions()))
    expect(captured).toMatchObject({
      providerID: 'anthropic',
      modelID: 'claude-sonnet-4-5',
    })
  })

  it('rejects a model id without a provider prefix', async () => {
    const chunks = await collect(
      opencodeText('claude-sonnet-4-5').chatStream(makeOptions()),
    )
    expect(startSessionMock).not.toHaveBeenCalled()
    expect(chunks.at(-1)).toMatchObject({ type: 'RUN_ERROR' })
    expect((chunks.at(-1) as { message: string }).message).toMatch(
      /provider\/model/,
    )
  })

  it('starts a fresh session without a sessionId', async () => {
    await collect(opencodeText(MODEL).chatStream(makeOptions()))
    expect(captured?.resumeSessionId).toBeUndefined()
    expect(promptMock.mock.calls[0]![0]).toBe('hello')
  })

  it('resumes the session and sends only the trailing user message', async () => {
    await collect(
      opencodeText(MODEL).chatStream(
        makeOptions({
          messages: [
            { role: 'user', content: 'first' },
            { role: 'assistant', content: 'answer' },
            { role: 'user', content: 'follow-up' },
          ],
          modelOptions: { sessionId: 'sess-prior' },
        }),
      ),
    )
    expect(captured?.resumeSessionId).toBe('sess-prior')
    expect(promptMock.mock.calls[0]![0]).toBe('follow-up')
  })

  it('flattens prior turns into the prompt without a sessionId', async () => {
    await collect(
      opencodeText(MODEL).chatStream(
        makeOptions({
          messages: [
            { role: 'user', content: 'first' },
            { role: 'assistant', content: 'answer' },
            { role: 'user', content: 'follow-up' },
          ],
        }),
      ),
    )
    expect(promptMock.mock.calls[0]![0]).toBe(
      'Previous conversation:\nUser: first\nAssistant: answer\n\nfollow-up',
    )
  })

  it('uses the configured directory and a default permission policy', async () => {
    await collect(
      opencodeText(MODEL, { directory: '/workspace' }).chatStream(
        makeOptions(),
      ),
    )
    expect(captured?.directory).toBe('/workspace')
    expect(captured?.permission).toMatchObject({
      edit: 'ask',
      bash: 'ask',
      webfetch: 'ask',
    })
  })

  it('lets modelOptions.directory override the configured directory', async () => {
    await collect(
      opencodeText(MODEL, { directory: '/workspace' }).chatStream(
        makeOptions({ modelOptions: { directory: '/elsewhere' } }),
      ),
    )
    expect(captured?.directory).toBe('/elsewhere')
  })

  it('opens permissions for bypassPermissions mode', async () => {
    await collect(
      opencodeText(MODEL, { permissionMode: 'bypassPermissions' }).chatStream(
        makeOptions(),
      ),
    )
    expect(captured?.permission).toMatchObject({
      edit: 'allow',
      bash: 'allow',
      webfetch: 'allow',
    })
  })

  it('prepends system prompts to the prompt text', async () => {
    await collect(
      opencodeText(MODEL).chatStream(
        makeOptions({ systemPrompts: ['Be terse.', 'Use tabs.'] }),
      ),
    )
    expect(promptMock.mock.calls[0]![0]).toBe('Be terse.\n\nUse tabs.\n\nhello')
  })

  it('starts a localhost MCP bridge and registers it when tools are passed', async () => {
    await collect(
      opencodeText(MODEL).chatStream(
        makeOptions({
          tools: [
            {
              name: 'lookup_user',
              description: 'Look up a user',
              inputSchema: { type: 'object', properties: {} },
              execute: async () => ({ ok: true }),
            } as never,
          ],
        }),
      ),
    )
    expect(bridgeMock).toHaveBeenCalledTimes(1)
    expect(captured?.mcpServers).toEqual([
      { name: 'tanstack', url: 'http://127.0.0.1:54321/mcp' },
    ])
    expect(bridgeCloseMock).toHaveBeenCalledTimes(1)
  })

  it('does not start a bridge when no tools are passed', async () => {
    await collect(opencodeText(MODEL).chatStream(makeOptions()))
    expect(bridgeMock).not.toHaveBeenCalled()
    expect(captured?.mcpServers).toBeUndefined()
  })

  it('emits RUN_ERROR for client-side tools (no execute)', async () => {
    const chunks = await collect(
      opencodeText(MODEL).chatStream(
        makeOptions({
          tools: [
            {
              name: 'client_only',
              description: 'runs in browser',
              inputSchema: { type: 'object', properties: {} },
            } as never,
          ],
        }),
      ),
    )
    expect(startSessionMock).not.toHaveBeenCalled()
    expect(chunks.at(-1)).toMatchObject({ type: 'RUN_ERROR' })
    expect((chunks.at(-1) as { message: string }).message).toMatch(
      /client-side/i,
    )
  })

  it('emits RUN_ERROR for approval-gated tools', async () => {
    const chunks = await collect(
      opencodeText(MODEL).chatStream(
        makeOptions({
          tools: [
            {
              name: 'needs_ok',
              description: 'requires approval',
              inputSchema: { type: 'object', properties: {} },
              execute: async () => 'x',
              needsApproval: true,
            } as never,
          ],
        }),
      ),
    )
    expect(chunks.at(-1)).toMatchObject({ type: 'RUN_ERROR' })
  })

  it('aborts the session when the external signal fires', async () => {
    const controller = new AbortController()
    controller.abort()
    await collect(
      opencodeText(MODEL).chatStream(
        makeOptions({ abortController: controller }),
      ),
    )
    expect(abortMock).toHaveBeenCalledTimes(1)
  })

  it('emits RUN_ERROR when the prompt turn rejects', async () => {
    promptMock.mockRejectedValueOnce(new Error('boom'))
    const chunks = await collect(opencodeText(MODEL).chatStream(makeOptions()))
    expect(chunks.at(-1)).toMatchObject({ type: 'RUN_ERROR', message: 'boom' })
    expect(disposeMock).toHaveBeenCalledTimes(1)
  })

  it('emits RUN_ERROR when starting the session throws', async () => {
    startSessionMock.mockRejectedValueOnce(new Error('serve failed'))
    const chunks = await collect(opencodeText(MODEL).chatStream(makeOptions()))
    expect(chunks.at(-1)).toMatchObject({
      type: 'RUN_ERROR',
      message: 'serve failed',
    })
  })
})

describe('structuredOutput', () => {
  it('parses the final message text and reports usage', async () => {
    promptMock.mockResolvedValueOnce({
      message: {
        id: 'm1',
        role: 'assistant',
        finish: 'stop',
        tokens: { input: 7, output: 3 },
      },
      text: '{"answer":42}',
    })
    const result = await opencodeText(MODEL).structuredOutput({
      chatOptions: makeOptions(),
      outputSchema: {
        type: 'object',
        properties: { answer: { type: 'number' } },
      },
    })
    expect(result.data).toEqual({ answer: 42 })
    expect(result.rawText).toBe('{"answer":42}')
    expect(result.usage).toMatchObject({ promptTokens: 7, completionTokens: 3 })
  })

  it('strips markdown fences from the model output', async () => {
    promptMock.mockResolvedValueOnce({
      message: { id: 'm1', role: 'assistant', finish: 'stop' },
      text: '```json\n{"ok":true}\n```',
    })
    const result = await opencodeText(MODEL).structuredOutput({
      chatOptions: makeOptions(),
      outputSchema: { type: 'object' },
    })
    expect(result.data).toEqual({ ok: true })
  })

  it('runs a fresh session even when a sessionId is supplied', async () => {
    promptMock.mockResolvedValueOnce({
      message: { id: 'm1', role: 'assistant', finish: 'stop' },
      text: '{}',
    })
    await opencodeText(MODEL).structuredOutput({
      chatOptions: makeOptions({ modelOptions: { sessionId: 'sess-live' } }),
      outputSchema: { type: 'object' },
    })
    expect(captured?.resumeSessionId).toBeUndefined()
  })

  it('throws a descriptive error when the message carries an error', async () => {
    promptMock.mockResolvedValueOnce({
      message: {
        id: 'm1',
        role: 'assistant',
        error: { name: 'ProviderAuthError', data: { message: 'no key' } },
      },
      text: '',
    })
    await expect(
      opencodeText(MODEL).structuredOutput({
        chatOptions: makeOptions(),
        outputSchema: { type: 'object' },
      }),
    ).rejects.toThrow(/no key/)
  })

  it('throws when the run ends without any text', async () => {
    promptMock.mockResolvedValueOnce({
      message: { id: 'm1', role: 'assistant', finish: 'stop' },
      text: '   ',
    })
    await expect(
      opencodeText(MODEL).structuredOutput({
        chatOptions: makeOptions(),
        outputSchema: { type: 'object' },
      }),
    ).rejects.toThrow(/without a response/)
  })
})
