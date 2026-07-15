import { beforeEach, describe, expect, it, vi } from 'vitest'
import { startAcpSession } from '../src/process/acp-client'
import { startToolBridge } from '../src/tools/bridge'
import { geminiCliText } from '../src/adapters/text'
import type { StartAcpSessionOptions } from '../src/process/acp-client'
import type { AcpStopReason, AcpUsage } from '../src/stream/acp-types'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { StreamChunk, TextOptions } from '@tanstack/ai'

vi.mock('../src/process/acp-client', () => ({
  startAcpSession: vi.fn(),
}))
vi.mock('../src/tools/bridge', () => ({
  startToolBridge: vi.fn(),
}))

const startAcpSessionMock = vi.mocked(startAcpSession)
const startToolBridgeMock = vi.mocked(startToolBridge)

const cancelMock = vi.fn()
const disposeMock = vi.fn()
const bridgeCloseMock = vi.fn()

interface ScriptedTurn {
  updates?: Array<Parameters<StartAcpSessionOptions['onUpdate']>[0]>
  stopReason?: AcpStopReason
  usage?: AcpUsage
  resumed?: boolean
  sessionId?: string
  promptError?: Error
}

/** Captured options from the most recent startAcpSession call. */
let capturedOptions: StartAcpSessionOptions | undefined

function scriptSession(turn: ScriptedTurn = {}) {
  startAcpSessionMock.mockImplementation((options) => {
    capturedOptions = options
    return Promise.resolve({
      sessionId: turn.sessionId ?? 'sess-1',
      resumed: turn.resumed ?? false,
      prompt: (text: string) => {
        void text
        if (turn.promptError) return Promise.reject(turn.promptError)
        for (const update of turn.updates ?? []) {
          options.onUpdate(update)
        }
        return Promise.resolve({
          stopReason: turn.stopReason ?? 'end_turn',
          ...(turn.usage !== undefined && { usage: turn.usage }),
        })
      },
      cancel: cancelMock,
      dispose: disposeMock,
    })
  })
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
    model: 'gemini-3-pro-preview',
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

const textUpdate = (text: string) => ({
  sessionUpdate: 'agent_message_chunk' as const,
  content: { type: 'text' as const, text },
})

beforeEach(() => {
  startAcpSessionMock.mockReset()
  startToolBridgeMock.mockReset()
  cancelMock.mockReset()
  disposeMock.mockReset()
  bridgeCloseMock.mockReset()
  capturedOptions = undefined
  startToolBridgeMock.mockResolvedValue({
    url: 'http://127.0.0.1:7777/mcp',
    close: bridgeCloseMock,
  })
  scriptSession({ updates: [textUpdate('hi there')] })
})

describe('geminiCliText', () => {
  it('creates an adapter with the gemini-cli provider name', () => {
    const adapter = geminiCliText('gemini-3-pro-preview')
    expect(adapter.kind).toBe('text')
    expect(adapter.name).toBe('gemini-cli')
    expect(adapter.model).toBe('gemini-3-pro-preview')
  })
})

describe('chatStream', () => {
  it('streams translated AG-UI events for a simple turn', async () => {
    const adapter = geminiCliText('gemini-3-pro-preview')
    const chunks = await collect(adapter.chatStream(makeOptions()))
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

  it('spawns with the configured model, cwd, and executable', async () => {
    const adapter = geminiCliText('gemini-3-pro-preview', {
      cwd: '/workspace',
      executablePath: '/opt/bin/gemini',
      extraArgs: ['--sandbox'],
    })
    await collect(adapter.chatStream(makeOptions()))
    expect(capturedOptions).toMatchObject({
      model: 'gemini-3-pro-preview',
      cwd: '/workspace',
      executablePath: '/opt/bin/gemini',
      extraArgs: ['--sandbox'],
    })
  })

  it('passes the configured ACP auth method through to the session', async () => {
    const adapter = geminiCliText('gemini-3-pro-preview', {
      authMethodId: 'oauth-personal',
    })
    await collect(adapter.chatStream(makeOptions()))
    expect(capturedOptions).toMatchObject({ authMethodId: 'oauth-personal' })
  })

  it('lets modelOptions override the configured ACP auth method', async () => {
    const adapter = geminiCliText('gemini-3-pro-preview', {
      authMethodId: 'oauth-personal',
    })
    await collect(
      adapter.chatStream(
        makeOptions({ modelOptions: { authMethodId: 'gemini-api-key' } }),
      ),
    )
    expect(capturedOptions).toMatchObject({ authMethodId: 'gemini-api-key' })
  })

  it('omits authMethodId when none is configured', async () => {
    const adapter = geminiCliText('gemini-3-pro-preview')
    await collect(adapter.chatStream(makeOptions()))
    expect(capturedOptions?.authMethodId).toBeUndefined()
  })

  it('sends only the trailing user message and requests resume with a sessionId', async () => {
    scriptSession({ resumed: true, sessionId: 'sess-prior' })
    const promptSpy = vi.fn()
    startAcpSessionMock.mockImplementation((options) => {
      capturedOptions = options
      return Promise.resolve({
        sessionId: 'sess-prior',
        resumed: true,
        prompt: (text: string) => {
          promptSpy(text)
          return Promise.resolve({ stopReason: 'end_turn' as const })
        },
        cancel: cancelMock,
        dispose: disposeMock,
      })
    })

    const adapter = geminiCliText('gemini-3-pro-preview')
    await collect(
      adapter.chatStream(
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
    expect(capturedOptions).toMatchObject({ resumeSessionId: 'sess-prior' })
    expect(promptSpy).toHaveBeenCalledWith('follow-up')
  })

  it('falls back to the flattened transcript when resume is unavailable', async () => {
    const promptSpy = vi.fn()
    startAcpSessionMock.mockImplementation((options) => {
      capturedOptions = options
      return Promise.resolve({
        sessionId: 'sess-fresh',
        resumed: false,
        prompt: (text: string) => {
          promptSpy(text)
          return Promise.resolve({ stopReason: 'end_turn' as const })
        },
        cancel: cancelMock,
        dispose: disposeMock,
      })
    })

    const adapter = geminiCliText('gemini-3-pro-preview')
    const chunks = await collect(
      adapter.chatStream(
        makeOptions({
          messages: [
            { role: 'user', content: 'first' },
            { role: 'assistant', content: 'answer' },
            { role: 'user', content: 'follow-up' },
          ],
          modelOptions: { sessionId: 'sess-gone' },
        }),
      ),
    )
    expect(promptSpy).toHaveBeenCalledWith(
      'Previous conversation:\nUser: first\nAssistant: answer\n\nfollow-up',
    )
    // The fresh session id is surfaced so the client can re-sync.
    expect(chunks.find((c) => c.type === 'CUSTOM')).toMatchObject({
      value: { sessionId: 'sess-fresh' },
    })
  })

  it('prepends system prompts to the prompt text', async () => {
    const promptSpy = vi.fn()
    startAcpSessionMock.mockImplementation((options) => {
      capturedOptions = options
      return Promise.resolve({
        sessionId: 'sess-1',
        resumed: false,
        prompt: (text: string) => {
          promptSpy(text)
          return Promise.resolve({ stopReason: 'end_turn' as const })
        },
        cancel: cancelMock,
        dispose: disposeMock,
      })
    })
    const adapter = geminiCliText('gemini-3-pro-preview')
    await collect(
      adapter.chatStream(
        makeOptions({ systemPrompts: ['Be terse.', 'Use tabs.'] }),
      ),
    )
    expect(promptSpy).toHaveBeenCalledWith('Be terse.\n\nUse tabs.\n\nhello')
  })

  it('starts the MCP bridge and hands its URL to the session when tools are passed', async () => {
    const adapter = geminiCliText('gemini-3-pro-preview')
    await collect(
      adapter.chatStream(
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
    expect(startToolBridgeMock).toHaveBeenCalledTimes(1)
    expect(capturedOptions).toMatchObject({
      mcpServers: [{ name: 'tanstack', url: 'http://127.0.0.1:7777/mcp' }],
    })
    expect(bridgeCloseMock).toHaveBeenCalledTimes(1)
  })

  it('does not start the bridge when no tools are passed', async () => {
    const adapter = geminiCliText('gemini-3-pro-preview')
    await collect(adapter.chatStream(makeOptions()))
    expect(startToolBridgeMock).not.toHaveBeenCalled()
    expect(capturedOptions?.mcpServers).toBeUndefined()
  })

  it('wires the default permission policy through the session options', async () => {
    const adapter = geminiCliText('gemini-3-pro-preview', {
      permissionMode: 'acceptEdits',
    })
    await collect(
      adapter.chatStream(
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

    const handler = capturedOptions!.onPermissionRequest
    const options = [
      { optionId: 'yes', name: 'Allow', kind: 'allow_once' as const },
      { optionId: 'no', name: 'Reject', kind: 'reject_once' as const },
    ]

    await expect(
      Promise.resolve(
        handler({
          sessionId: 's',
          toolCall: {
            toolCallId: 't1',
            title: 'lookup_user (tanstack MCP Server)',
            kind: 'other',
          },
          options,
        }),
      ),
    ).resolves.toEqual({ outcome: 'selected', optionId: 'yes' })

    await expect(
      Promise.resolve(
        handler({
          sessionId: 's',
          toolCall: { toolCallId: 't2', title: 'Edit file', kind: 'edit' },
          options,
        }),
      ),
    ).resolves.toEqual({ outcome: 'selected', optionId: 'yes' })

    await expect(
      Promise.resolve(
        handler({
          sessionId: 's',
          toolCall: { toolCallId: 't3', title: 'Run command', kind: 'execute' },
          options,
        }),
      ),
    ).resolves.toEqual({ outcome: 'selected', optionId: 'no' })
  })

  it('lets a custom onPermissionRequest replace the default policy', async () => {
    const custom = vi.fn().mockResolvedValue({ outcome: 'cancelled' })
    const adapter = geminiCliText('gemini-3-pro-preview', {
      onPermissionRequest: custom,
    })
    await collect(adapter.chatStream(makeOptions()))
    expect(capturedOptions!.onPermissionRequest).toBe(custom)
  })

  it('cancels the harness turn when the abort signal fires', async () => {
    let resolvePrompt: (() => void) | undefined
    startAcpSessionMock.mockImplementation((options) => {
      capturedOptions = options
      return Promise.resolve({
        sessionId: 'sess-1',
        resumed: false,
        prompt: () =>
          new Promise((resolve) => {
            resolvePrompt = () => resolve({ stopReason: 'cancelled' as const })
          }),
        cancel: cancelMock.mockImplementation(() => {
          resolvePrompt?.()
          return Promise.resolve()
        }),
        dispose: disposeMock,
      })
    })

    const controller = new AbortController()
    const adapter = geminiCliText('gemini-3-pro-preview')
    const collected = collect(
      adapter.chatStream(makeOptions({ abortController: controller })),
    )
    // Give the stream a beat to start the session, then abort.
    await new Promise((resolve) => setTimeout(resolve, 0))
    controller.abort()
    const chunks = await collected
    expect(cancelMock).toHaveBeenCalled()
    expect(chunks.at(-1)).toMatchObject({
      type: 'RUN_FINISHED',
      finishReason: 'stop',
    })
  })

  it('disposes the session after the stream completes', async () => {
    const adapter = geminiCliText('gemini-3-pro-preview')
    await collect(adapter.chatStream(makeOptions()))
    expect(disposeMock).toHaveBeenCalledTimes(1)
  })

  it('emits RUN_ERROR and disposes when the prompt fails', async () => {
    scriptSession({ promptError: new Error('connection lost') })
    const adapter = geminiCliText('gemini-3-pro-preview')
    const chunks = await collect(adapter.chatStream(makeOptions()))
    expect(chunks.at(-1)).toMatchObject({
      type: 'RUN_ERROR',
      message: 'connection lost',
    })
    expect(disposeMock).toHaveBeenCalledTimes(1)
  })

  it('emits RUN_ERROR when the CLI cannot be spawned', async () => {
    startAcpSessionMock.mockRejectedValue(new Error('gemini not found'))
    const adapter = geminiCliText('gemini-3-pro-preview')
    const chunks = await collect(adapter.chatStream(makeOptions()))
    expect(chunks.at(-1)).toMatchObject({
      type: 'RUN_ERROR',
      message: 'gemini not found',
    })
  })

  it('emits RUN_ERROR for client-side tools (no execute)', async () => {
    const adapter = geminiCliText('gemini-3-pro-preview')
    const chunks = await collect(
      adapter.chatStream(
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
    expect(startAcpSessionMock).not.toHaveBeenCalled()
    expect(chunks.at(-1)).toMatchObject({ type: 'RUN_ERROR' })
    expect((chunks.at(-1) as { message: string }).message).toMatch(
      /client-side/i,
    )
  })

  it('emits RUN_ERROR for approval-gated tools', async () => {
    const adapter = geminiCliText('gemini-3-pro-preview')
    const chunks = await collect(
      adapter.chatStream(
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
})

describe('structuredOutput', () => {
  it('embeds the schema in the prompt and parses the JSON response', async () => {
    const promptSpy = vi.fn()
    startAcpSessionMock.mockImplementation((options) => {
      capturedOptions = options
      return Promise.resolve({
        sessionId: 'sess-so',
        resumed: false,
        prompt: (text: string) => {
          promptSpy(text)
          options.onUpdate(textUpdate('{"answer":42}'))
          return Promise.resolve({
            stopReason: 'end_turn' as const,
            usage: { inputTokens: 7, outputTokens: 3, totalTokens: 10 },
          })
        },
        cancel: cancelMock,
        dispose: disposeMock,
      })
    })
    const adapter = geminiCliText('gemini-3-pro-preview')
    const result = await adapter.structuredOutput({
      chatOptions: makeOptions(),
      outputSchema: {
        type: 'object',
        properties: { answer: { type: 'number' } },
      },
    })
    expect(result.data).toEqual({ answer: 42 })
    expect(result.rawText).toBe('{"answer":42}')
    expect(result.usage).toMatchObject({
      promptTokens: 7,
      completionTokens: 3,
      totalTokens: 10,
    })
    expect(promptSpy.mock.calls[0]![0]).toContain('JSON Schema')
    expect(promptSpy.mock.calls[0]![0]).toContain('"answer"')
    expect(disposeMock).toHaveBeenCalledTimes(1)
  })

  it('strips markdown fences from the response', async () => {
    scriptSession({
      updates: [textUpdate('```json\n{"answer":7}\n```')],
    })
    const adapter = geminiCliText('gemini-3-pro-preview')
    const result = await adapter.structuredOutput({
      chatOptions: makeOptions(),
      outputSchema: { type: 'object' },
    })
    expect(result.data).toEqual({ answer: 7 })
  })

  it('extracts JSON embedded in prose', async () => {
    scriptSession({
      updates: [textUpdate('Sure! Here you go: {"answer":1} Hope that helps.')],
    })
    const adapter = geminiCliText('gemini-3-pro-preview')
    const result = await adapter.structuredOutput({
      chatOptions: makeOptions(),
      outputSchema: { type: 'object' },
    })
    expect(result.data).toEqual({ answer: 1 })
  })

  it('throws when the harness refuses', async () => {
    scriptSession({
      updates: [textUpdate('no')],
      stopReason: 'refusal',
    })
    const adapter = geminiCliText('gemini-3-pro-preview')
    await expect(
      adapter.structuredOutput({
        chatOptions: makeOptions(),
        outputSchema: { type: 'object' },
      }),
    ).rejects.toThrow(/refused/)
  })

  it('throws when the run produces no text', async () => {
    scriptSession({ updates: [] })
    const adapter = geminiCliText('gemini-3-pro-preview')
    await expect(
      adapter.structuredOutput({
        chatOptions: makeOptions(),
        outputSchema: { type: 'object' },
      }),
    ).rejects.toThrow(/without a response/)
  })
})
