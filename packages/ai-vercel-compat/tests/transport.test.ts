import { describe, expect, it, vi } from 'vitest'
import {
  chat,
  chatParamsFromRequest,
  toServerSentEventsResponse,
  toolDefinition,
} from '@tanstack/ai'
import { fakeText } from '@tanstack/ai/testing'
import { fetchServerSentEvents } from '@tanstack/ai-client'
import { readUIMessageStream } from 'ai'
import { z } from 'zod'
import { toChatTransport } from '../src'
import type { FakeResponse, FakeResponseStep } from '@tanstack/ai/testing'
import type { UIMessage, UIMessageChunk } from 'ai'

// A plain TanStack route: no AI SDK code on the server.
function plainRoute(first: FakeResponse) {
  const execute = vi.fn(({ path }: { path: string }) => `deleted ${path}`)
  const tools = [
    toolDefinition({
      name: 'getWeather',
      description: 'Get the weather',
      inputSchema: z.object({ city: z.string() }),
    }).server(({ city }) => `sunny in ${city}`),
    toolDefinition({
      name: 'deleteFile',
      description: 'Delete a file',
      inputSchema: z.object({ path: z.string() }),
      needsApproval: true,
    }).server(execute),
    // No `.server()`: the AI SDK client runs it.
    toolDefinition({
      name: 'getLocation',
      description: 'The location of the user',
      inputSchema: z.object({}),
    }),
  ]
  const fetchClient = async (url: RequestInfo | URL, init?: RequestInit) => {
    const params = await chatParamsFromRequest(new Request(url, init))
    const fake = fakeText()
    // Each model call answers a tool result with "Tool said: <result>".
    const step: FakeResponseStep = ({ request }) => {
      const last = request.messages.at(-1)
      return last?.role === 'tool'
        ? { text: `Tool said: ${String(last.content)}` }
        : first
    }
    fake.setResponses([step, step])
    // `params.tools` are the client's tools. The route's own tools win.
    return toServerSentEventsResponse(chat({ ...params, adapter: fake, tools }))
  }
  const transport = toChatTransport(
    fetchServerSentEvents('http://x/api/chat', { fetchClient }),
  )
  return { transport, execute }
}

const user: UIMessage = {
  id: 'u-1',
  role: 'user',
  parts: [{ type: 'text', text: 'hi' }],
}

async function send(
  transport: ReturnType<typeof plainRoute>['transport'],
  messages: Array<UIMessage>,
  abortSignal?: AbortSignal,
) {
  return transport.sendMessages({
    trigger: 'submit-message',
    chatId: 'chat-1',
    messageId: undefined,
    messages,
    abortSignal,
  })
}

async function lastMessage(
  stream: ReadableStream<UIMessageChunk>,
  message?: UIMessage,
): Promise<UIMessage> {
  let last: UIMessage | undefined
  for await (const m of readUIMessageStream({ stream, message })) last = m
  return last!
}

function textOf(message: UIMessage): string {
  return message.parts
    .flatMap((p) => (p.type === 'text' ? [p.text] : []))
    .join('')
}

describe('toChatTransport: AI SDK client, plain TanStack route', () => {
  it('streams a server tool and the answer', async () => {
    const { transport } = plainRoute({
      toolCalls: [{ name: 'getWeather', input: { city: 'Oslo' } }],
    })
    const message = await lastMessage(await send(transport, [user]))
    expect(message.parts).toContainEqual(
      expect.objectContaining({
        type: 'tool-getWeather',
        state: 'output-available',
        output: 'sunny in Oslo',
      }),
    )
    expect(textOf(message)).toBe('Tool said: sunny in Oslo')
  })

  it.each([true, false])(
    'resumes an approval answer (approved: %s)',
    async (approved) => {
      const { transport, execute } = plainRoute({
        toolCalls: [{ name: 'deleteFile', input: { path: 'a.txt' } }],
      })
      const first = await lastMessage(await send(transport, [user]))
      const answered: UIMessage = {
        ...first,
        parts: first.parts.map((part) =>
          part.type === 'tool-deleteFile' && part.state === 'approval-requested'
            ? {
                ...part,
                state: 'approval-responded',
                approval: { id: part.approval.id, approved },
              }
            : part,
        ),
      }
      expect(execute).not.toHaveBeenCalled()
      const second = await lastMessage(
        await send(transport, [user, answered]),
        answered,
      )
      expect(execute).toHaveBeenCalledTimes(approved ? 1 : 0)
      expect(second.parts).toContainEqual(
        expect.objectContaining({
          type: 'tool-deleteFile',
          state: approved ? 'output-available' : 'output-denied',
        }),
      )
      if (approved) expect(textOf(second)).toBe('Tool said: deleted a.txt')
    },
  )

  it('continues after a client tool output', async () => {
    const { transport } = plainRoute({
      toolCalls: [{ name: 'getLocation', input: {} }],
    })
    const first = await lastMessage(await send(transport, [user]))
    const call = first.parts.find((p) => p.type === 'tool-getLocation')
    expect(call).toMatchObject({ state: 'input-available' })
    // `addToolOutput` in `onToolCall` sets this state.
    const answered: UIMessage = {
      ...first,
      parts: first.parts.map((part) =>
        part.type === 'tool-getLocation' && part.state === 'input-available'
          ? { ...part, state: 'output-available', output: 'Berlin' }
          : part,
      ),
    }
    const second = await lastMessage(
      await send(transport, [user, answered]),
      answered,
    )
    expect(textOf(second)).toBe('Tool said: Berlin')
  })

  it('sends a server error as an error chunk', async () => {
    const { transport } = plainRoute({ error: 'The model is down' })
    const chunks: Array<UIMessageChunk> = []
    for await (const chunk of await send(transport, [user])) chunks.push(chunk)
    expect(chunks).toContainEqual({
      type: 'error',
      errorText: expect.stringContaining('The model is down'),
    })
    expect(chunks.some((c) => c.type === 'finish')).toBe(false)
  })

  it('stops reading when the request is aborted', async () => {
    const { transport } = plainRoute({ text: 'a long answer' })
    const controller = new AbortController()
    controller.abort()
    const chunks: Array<UIMessageChunk> = []
    for await (const chunk of await send(transport, [user], controller.signal))
      chunks.push(chunk)
    expect(chunks.some((c) => c.type === 'text-delta')).toBe(false)
  })

  it('has nothing to resume before a run', async () => {
    const { transport } = plainRoute({ text: 'hi' })
    expect(await transport.reconnectToStream({ chatId: 'chat-1' })).toBeNull()
  })
})
