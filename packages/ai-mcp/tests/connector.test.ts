import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  HARNESS_EVENTS,
  createHarnessHost,
  defineHarness,
} from '@tanstack/ai-harness'
import { mcpConnector } from '../src/connector'
import { startProtectedServer } from './protected-server'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'

/** A model that calls `tool` once, then answers with the tool result it saw. */
function modelCalling(
  tool: string,
  args: Record<string, unknown>,
): AnyTextAdapter {
  let call = 0
  const now = () => Date.now()
  return {
    kind: 'text',
    name: 'mock',
    model: 'mock',
    '~types': {
      providerOptions: {} as Record<string, unknown>,
      inputModalities: ['text'] as readonly ['text'],
      messageMetadataByModality: {
        text: undefined as unknown,
        image: undefined as unknown,
        audio: undefined as unknown,
        video: undefined as unknown,
        document: undefined as unknown,
      },
      toolCapabilities: [] as ReadonlyArray<string>,
      toolCallMetadata: undefined as unknown,
      systemPromptMetadata: undefined as never,
    },
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
    chatStream: (options) =>
      (async function* (): AsyncGenerator<StreamChunk> {
        call += 1
        yield {
          type: EventType.RUN_STARTED,
          runId: 'r',
          threadId: 't',
          timestamp: now(),
        }
        if (call === 1) {
          yield {
            type: EventType.TOOL_CALL_START,
            toolCallId: 'c1',
            toolCallName: tool,
            timestamp: now(),
          }
          yield {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: 'c1',
            delta: JSON.stringify(args),
            timestamp: now(),
          }
          yield {
            type: EventType.TOOL_CALL_END,
            toolCallId: 'c1',
            timestamp: now(),
          }
          yield {
            type: EventType.RUN_FINISHED,
            runId: 'r',
            threadId: 't',
            timestamp: now(),
            metadata: { tanstack: { finishReason: 'tool_calls' } },
          }
          return
        }
        const last = options.messages.at(-1)
        const text = `saw: ${typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content)}`
        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId: `m${call}`,
          role: 'assistant',
          timestamp: now(),
        }
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: `m${call}`,
          delta: text,
          timestamp: now(),
        }
        yield {
          type: EventType.TEXT_MESSAGE_END,
          messageId: `m${call}`,
          timestamp: now(),
        }
        yield {
          type: EventType.RUN_FINISHED,
          runId: 'r',
          threadId: 't',
          timestamp: now(),
          metadata: { tanstack: { finishReason: 'stop' } },
        }
      })(),
  }
}

const cleanups: Array<() => unknown> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

describe('mcpConnector', () => {
  it('signs in with OAuth discovery, registration, and PKCE, then gives the model the server tools', async () => {
    const protectedServer = await startProtectedServer()
    cleanups.push(() => protectedServer.close())
    const persistence = memoryPersistence()
    const host = createHarnessHost({ persistence })
    cleanups.push(() => host.close())
    const harness = defineHarness({
      name: 'test/mcp-connector',
      adapter: modelCalling('demo_echo', { text: 'hello' }),
      plugins: () => [
        mcpConnector({ id: 'demo', label: 'Demo', url: protectedServer.url }),
      ],
    })
    const session = await host.open(harness, {
      threadId: 't',
      principal: { id: 'user-1' },
    })

    // Act as the browser: approve the sign-in by calling the loopback redirect.
    const reader = new AbortController()
    let authorizationUrl: URL | undefined
    void (async () => {
      for await (const entry of session.events({ signal: reader.signal })) {
        const event = entry.event
        if (
          event.type === EventType.CUSTOM &&
          event.name === HARNESS_EVENTS.authRequired
        ) {
          authorizationUrl = new URL(
            String((event.value as { url: string }).url),
          )
          const redirect = new URL(
            authorizationUrl.searchParams.get('redirect_uri') ?? '',
          )
          redirect.searchParams.set('code', 'code-1')
          redirect.searchParams.set(
            'state',
            authorizationUrl.searchParams.get('state') ?? '',
          )
          await fetch(redirect)
        }
      }
    })()
    cleanups.push(() => reader.abort())

    await expect(session.command('connect:demo')).resolves.toBe(
      'Connected to Demo.',
    )
    expect(authorizationUrl?.searchParams.get('client_id')).toBe('client-1')
    expect(authorizationUrl?.searchParams.get('code_challenge_method')).toBe(
      'S256',
    )
    expect(
      new URL(authorizationUrl?.searchParams.get('redirect_uri') ?? '')
        .hostname,
    ).toBe('127.0.0.1')
    expect(protectedServer.seen.registrations).toHaveLength(1)
    expect(
      protectedServer.seen.tokenRequests[0]?.get('code_verifier'),
    ).toBeTruthy()

    const saved = await persistence.stores.credentials.get(
      { threadId: 't', userId: 'user-1' },
      'demo',
    )
    expect(saved).toMatchObject({
      type: 'oauth',
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      client: { clientId: 'client-1' },
    })

    const turn = await session.prompt('echo hello')
    expect(turn.text).toContain('echo: hello')
    // The model never sees the token.
    expect(
      JSON.stringify(await persistence.stores.messages.loadThread('t')),
    ).not.toContain('access-1')

    await session.command('disconnect:demo')
    expect(
      await persistence.stores.credentials.get(
        { threadId: 't', userId: 'user-1' },
        'demo',
      ),
    ).toBeNull()
  })

  it('tells the model to ask for /connect before sign-in', async () => {
    const seen = vi.fn()
    const adapter: AnyTextAdapter = {
      ...modelCalling('x', {}),
      chatStream: (options) => {
        seen(options.systemPrompts)
        return (async function* (): AsyncGenerator<StreamChunk> {
          yield {
            type: EventType.RUN_STARTED,
            runId: 'r',
            threadId: 't',
            timestamp: Date.now(),
          }
          yield {
            type: EventType.RUN_FINISHED,
            runId: 'r',
            threadId: 't',
            timestamp: Date.now(),
            metadata: { tanstack: { finishReason: 'stop' } },
          }
        })()
      },
    }
    const host = createHarnessHost({ persistence: memoryPersistence() })
    cleanups.push(() => host.close())
    const session = await host.open(
      defineHarness({
        name: 'test/mcp-connector-off',
        adapter,
        plugins: () => [
          mcpConnector({
            id: 'demo',
            label: 'Demo',
            url: 'http://127.0.0.1:9/mcp',
          }),
        ],
      }),
      { threadId: 't' },
    )
    await session.prompt('hi')
    expect(JSON.stringify(seen.mock.calls[0]?.[0])).toContain(
      'run /connect demo',
    )
    expect(session.commands().map((command) => command.name)).toEqual([
      'connect:demo',
      'disconnect:demo',
    ])
  })
})
