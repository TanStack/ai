import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { defineAgent, toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import { workspaceTools } from '../src/first-party/coding'
import {
  after,
  gate,
  messageTexts,
  mockAdapter,
  text,
  toolCall,
} from './helpers'
import type { AnyTextAdapter, ModelMessage } from '@tanstack/ai'
import type { HarnessPlugin } from '../src'
import type { WorkspaceBackend } from '../src/first-party/coding/backend'

const root = resolve(tmpdir(), 'harness-background')
const MOVED =
  'The job moved to the background. Its id is call-1. You get a note when it ends.'

/** Open thread `t` of a harness with `options`. */
async function open(
  adapter: AnyTextAdapter,
  options: Omit<Parameters<typeof defineHarness>[0], 'name' | 'adapter'> = {},
) {
  const host = createHarnessHost({ persistence: memoryPersistence() })
  const session = await host.open(
    defineHarness({ name: 'test/background', adapter, ...options }),
    { threadId: 't' },
  )
  return { host, session }
}

/** The text of the tool result for call `id` that model call `call` got. */
function toolResultIn(call: { messages: Array<ModelMessage> }, id: string) {
  const message = call.messages.find(
    (entry) => entry.role === 'tool' && entry.toolCallId === id,
  )
  return String(message?.content)
}

/** Lead replies: call `name` with `args`, answer, then answer the wake. */
function lead(
  name: string,
  args: Record<string, unknown>,
  woke: { open: () => void },
) {
  return [
    () => toolCall(name, args, 'call-1'),
    () => text('Moved.'),
    () => {
      woke.open()
      return text('Got it.')
    },
  ]
}

describe('session.background', () => {
  it('moves a running bash command to the background', async () => {
    const finish = gate()
    const woke = gate()
    const commands: Array<string> = []
    const backend: WorkspaceBackend = {
      readFile: async (path) => {
        throw new Error(`No file ${path}`)
      },
      writeFile: async () => {},
      stat: async () => undefined,
      readdir: async () => [],
      exec: async (command) => {
        commands.push(command)
        await finish.opened
        return { exitCode: 0, stdout: 'built', stderr: '' }
      },
    }
    const plugins: Array<HarnessPlugin> = [workspaceTools({ root, backend })]
    const model = mockAdapter(lead('bash', { command: 'npm run build' }, woke))
    const { host, session } = await open(model.adapter, {
      plugins: () => plugins,
    })

    const turn = session.prompt('Build it')
    await vi.waitFor(() => expect(commands).toEqual(['npm run build']))
    expect(await session.background('call-1')).toMatchObject({
      status: 'accepted',
    })
    await turn

    expect(toolResultIn(model.calls[1], 'call-1')).toBe(MOVED)
    finish.open()
    await woke.opened
    expect(messageTexts(model.calls[2]).at(-1)).toBe(
      'Background job call-1 ended.\nexit code: 0\nbuilt',
    )
    await host.close()
  })

  it('moves a running subagent to the background', async () => {
    const finish = gate()
    const woke = gate()
    const child = mockAdapter(after(finish.opened, 'Found it'))
    const writer = defineAgent({
      name: 'writer',
      description: 'Writes notes',
      run: (ctx) => ctx.chat({ adapter: child.adapter }),
    })
    const model = mockAdapter(
      lead('subagent', { agent: 'writer', prompt: 'Look around' }, woke),
    )
    const { host, session } = await open(model.adapter, {
      subagents: { agents: [writer], tool: 'single' },
    })

    const turn = session.prompt('Look around for me')
    await vi.waitFor(() => expect(child.calls).toHaveLength(1))
    expect(await session.background()).toMatchObject({ status: 'accepted' })
    await turn

    expect(JSON.parse(toolResultIn(model.calls[1], 'call-1'))).toEqual({
      subagentRunId: '',
      result: MOVED,
    })
    finish.open()
    await woke.opened
    const note = messageTexts(model.calls[2]).at(-1) ?? ''
    expect(note.split('\n')[0]).toBe('Background job call-1 ended.')
    expect(JSON.parse(note.split('\n')[1] ?? '')).toMatchObject({
      text: 'Found it',
    })
    await host.close()
  })

  it('leaves a tool without support running', async () => {
    const finish = gate()
    const started = gate()
    const wait = toolDefinition({
      name: 'wait',
      description: 'Waits',
      inputSchema: { type: 'object', properties: {} },
    }).server(async () => {
      started.open()
      await finish.opened
      return 'waited'
    })
    const model = mockAdapter([
      () => toolCall('wait', {}, 'call-1'),
      () => text('Done.'),
    ])
    const { host, session } = await open(model.adapter, { tools: [wait] })

    const turn = session.prompt('Wait')
    await started.opened
    expect(await session.background()).toMatchObject({
      status: 'rejected',
      reason: 'not_running',
    })
    finish.open()
    await turn

    expect(toolResultIn(model.calls[1], 'call-1')).toBe('waited')
    await host.close()
  })
})
