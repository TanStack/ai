import { describe, expect, it, vi } from 'vitest'
import { toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { z } from 'zod'
import { createHarnessHandler, createHarnessHost, defineHarness } from '../src'
import { createHarnessClient } from '../src/client'
import { createSessionView } from '../src/view'
import { mockAdapter, text, toolCall } from './helpers'
import type { Reply } from './helpers'
import type { ClientToolCall } from '../src/view'

// No server implementation: the turn waits for the result from the UI.
const openScreen = toolDefinition({
  name: 'openScreen',
  description: 'Open a screen in the browser.',
  inputSchema: z.object({ route: z.string() }),
  outputSchema: z.object({ opened: z.boolean() }),
})
const remove = toolDefinition({
  name: 'remove',
  description: 'Remove',
  needsApproval: true,
}).server(async () => 'removed')

async function open(replies: Array<Reply>) {
  const main = mockAdapter(replies)
  const harness = defineHarness({
    name: 'test/view-client-tools',
    adapter: main.adapter,
    tools: [openScreen, remove],
  })
  const host = createHarnessHost({ persistence: memoryPersistence() })
  const session = await host.open(harness, { threadId: 't' })
  return { host, harness, session, calls: main.calls }
}

/** The tool messages the model got on its last call. */
const toolResults = (calls: Array<any>) =>
  (calls.at(-1).messages as Array<any>)
    .filter((message) => message.role === 'tool')
    .map((message) => JSON.parse(message.content))

describe('session view client tools', () => {
  it('lists a client tool apart from approvals and sends its output', async () => {
    const { host, harness, calls } = await open([
      () => toolCall('openScreen', { route: '/settings' }, 'c1'),
      () => text('Opened it.'),
    ])
    const handler = createHarnessHandler({
      host,
      harness,
      authorize: () => ({ id: 'u' }),
    })
    const controls: Array<unknown> = []
    const client = createHarnessClient({
      url: 'http://local/api/harness',
      threadId: 't',
      fetch: async (input, init) => {
        const request = new Request(input, init)
        if (request.url.endsWith('/control'))
          controls.push((await request.clone().json()).input)
        return handler(request)
      },
    })
    const view = createSessionView(client)
    const asked: Array<ClientToolCall> = []
    view.on('clientTool', (call) => asked.push(call))
    await view.ready

    await view.send('Open settings.')
    await vi.waitFor(() => expect(view.store.get().clientTools).toHaveLength(1))
    const [call] = view.store.get().clientTools
    expect(view.store.get().approvals).toEqual([])
    expect(call).toMatchObject({
      toolCallId: 'c1',
      tool: 'openScreen',
      args: { route: '/settings' },
    })
    expect(asked).toEqual([call])

    call?.resolve({ opened: true })

    await vi.waitFor(() =>
      expect(JSON.stringify(view.store.get().messages)).toContain('Opened it.'),
    )
    expect(controls.at(-1)).toEqual({
      op: 'resolve',
      resume: [
        { interruptId: call?.id, status: 'resolved', payload: { opened: true } },
      ],
    })
    expect(calls).toHaveLength(2)
    expect(toolResults(calls)).toEqual([{ opened: true }])
    expect(view.store.get().clientTools).toEqual([])
    view.dispose()
    await host.close()
  })

  it('sends one resolve when every approval and client tool has an answer', async () => {
    const { host, session, calls } = await open([
      () => [
        ...toolCall('remove', {}, 'c1').slice(0, -1),
        ...toolCall('openScreen', { route: '/home' }, 'c2').slice(1),
      ],
      () => text('Both done.'),
    ])
    const view = createSessionView(session)
    await view.ready
    const resolve = vi.spyOn(session, 'resolve')

    await view.send('clean up and go home')
    await vi.waitFor(() => {
      expect(view.store.get().approvals).toHaveLength(1)
      expect(view.store.get().clientTools).toHaveLength(1)
    })
    const [approval] = view.store.get().approvals
    const [call] = view.store.get().clientTools
    expect(approval?.tool).toBe('remove')
    expect(call?.tool).toBe('openScreen')

    approval?.approve()
    // A client tool id is not an approval, so a yes does not answer it.
    view.approve(call?.id ?? '')
    expect(resolve).not.toHaveBeenCalled()
    call?.resolve({ opened: true })
    call?.resolve({ opened: false })

    expect(resolve).toHaveBeenCalledTimes(1)
    expect(resolve.mock.calls[0]?.[0]).toEqual([
      { interruptId: approval?.id, status: 'resolved', payload: true },
      { interruptId: call?.id, status: 'resolved', payload: { opened: true } },
    ])
    await vi.waitFor(() =>
      expect(JSON.stringify(view.store.get().messages)).toContain('Both done.'),
    )
    expect(calls).toHaveLength(2)
    view.dispose()
    await host.close()
  })

  it('sends a failed client tool as an error the model sees', async () => {
    const { host, session, calls } = await open([
      () => toolCall('openScreen', { route: '/settings' }, 'c1'),
      () => text('It failed.'),
    ])
    const view = createSessionView(session)
    await view.ready
    const resolve = vi.spyOn(session, 'resolve')

    await view.send('Open settings.')
    await vi.waitFor(() => expect(view.store.get().clientTools).toHaveLength(1))
    const [call] = view.store.get().clientTools
    call?.fail('boom')

    expect(resolve.mock.calls[0]?.[0]).toEqual([
      {
        interruptId: call?.id,
        status: 'resolved',
        payload: { error: 'boom' },
        metadata: { tanstack: { state: 'output-error' } },
      },
    ])
    await vi.waitFor(() =>
      expect(JSON.stringify(view.store.get().messages)).toContain('It failed.'),
    )
    expect(calls).toHaveLength(2)
    expect(JSON.stringify(calls[1].messages)).toContain('boom')
    view.dispose()
    await host.close()
  })
})
