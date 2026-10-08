import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it, vi } from 'vitest'
import { toolDefinition } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, definePlugin } from '../src'
import { workspaceTools } from '../src/first-party/coding'
import { gate, mockAdapter, text, toolCall, untilAborted } from './helpers'
import type { AnyTextAdapter } from '@tanstack/ai'
import type { HarnessPlugin, HarnessSession, PluginSessionApi } from '../src'
import type { WorkspaceBackend } from '../src/first-party/coding/backend'

const THREAD = 't'

function durablePersistence() {
  const { runs, metadata } = memoryPersistence().stores
  return { stores: { log: memoryLogStore(), runs, metadata } }
}

type Durable = ReturnType<typeof durablePersistence>

/** The text of each assistant message in the transcript. */
async function assistantTexts(session: HarnessSession) {
  const messages = await session.transcript()
  return messages
    .filter((message) => message.role === 'assistant')
    .map((message) => message.content)
    .filter((content) => typeof content === 'string')
}

/** Open the thread on a new host that shares `persistence`. */
function openOn(
  persistence: Durable,
  adapter: AnyTextAdapter,
  plugins: Array<HarnessPlugin> = [],
) {
  return createHarnessHost({ persistence }).open(
    defineHarness({
      name: 'test/durable-background',
      adapter,
      plugins: () => plugins,
    }),
    { threadId: THREAD },
  )
}

describe('background work after a crash', () => {
  it('notes a moved tool call that the crash stopped', async () => {
    const persistence = durablePersistence()
    const started = gate()
    const wait = toolDefinition({
      name: 'wait',
      description: 'Waits',
      inputSchema: { type: 'object', properties: {} },
    }).server((_args: unknown, context) => {
      started.open()
      const work = new Promise<string>(() => {})
      const detach = context?.detach
      return detach ? Promise.race([work, detach(work)]) : work
    })
    const first = mockAdapter([
      () => toolCall('wait', {}, 'call-1'),
      () => text('Moved.'),
    ])
    const crashed = await createHarnessHost({ persistence }).open(
      defineHarness({
        name: 'test/durable-background',
        adapter: first.adapter,
        tools: [wait],
      }),
      { threadId: THREAD },
    )
    const turn = crashed.prompt('Wait')
    await started.opened
    expect(await crashed.background('call-1')).toMatchObject({
      status: 'accepted',
    })
    await turn

    // The first host never closes, like a process that stopped.
    const next = mockAdapter([])
    const recovered = await openOn(persistence, next.adapter)

    expect(await assistantTexts(recovered)).toEqual([
      'Moved.',
      'Background job call-1 stopped when the host restarted.',
    ])
    await recovered.recover()
    expect(await assistantTexts(recovered)).toHaveLength(2)
  })

  it('notes a bash background job that the crash stopped', async () => {
    const persistence = durablePersistence()
    const backend: WorkspaceBackend = {
      readFile: async (path) => {
        throw new Error(`No file ${path}`)
      },
      writeFile: async () => {},
      stat: async () => undefined,
      readdir: async () => [],
      exec: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
      spawn: () => ({
        wait: () => new Promise<{ exitCode: number }>(() => {}),
        kill: () => {},
        output: () => '',
      }),
    }
    const root = resolve(tmpdir(), 'harness-durable-background')
    const plugins = [workspaceTools({ root, backend })]
    const first = mockAdapter([
      () => toolCall('bash', { command: 'npm run dev', background: true }),
      () => text('Started.'),
    ])
    const crashed = await openOn(persistence, first.adapter, plugins)
    await crashed.prompt('Start the dev server')

    const next = mockAdapter([])
    const recovered = await openOn(persistence, next.adapter, plugins)

    expect(await assistantTexts(recovered)).toEqual([
      'Started.',
      'Background job bash-1 stopped when the host restarted.',
    ])
  })

  it('adds a note that waited for a busy turn once', async () => {
    const persistence = durablePersistence()
    let api: PluginSessionApi | undefined
    const noter = definePlugin({
      name: 'test/noter',
      setup: (ctx) => {
        api = ctx.session
      },
    })
    const noted = gate()
    const remind = toolDefinition({
      name: 'remind',
      description: 'Adds a note',
      inputSchema: { type: 'object', properties: {} },
    }).server(async () => {
      await api?.note('Remember the milk.')
      noted.open()
      return 'ok'
    })
    const first = mockAdapter([
      () => toolCall('remind', {}, 'call-1'),
      untilAborted(),
    ])
    const crashed = await createHarnessHost({ persistence }).open(
      defineHarness({
        name: 'test/durable-background',
        adapter: first.adapter,
        tools: [remind],
        plugins: () => [noter],
      }),
      { threadId: THREAD },
    )
    void Promise.resolve(crashed.prompt('Remind me')).catch(() => {})
    await noted.opened
    await vi.waitFor(() => expect(first.calls).toHaveLength(2))

    const next = mockAdapter([() => text('Done.')])
    const recovered = await createHarnessHost({ persistence }).open(
      defineHarness({
        name: 'test/durable-background',
        adapter: next.adapter,
        tools: [remind],
        plugins: () => [noter],
      }),
      { threadId: THREAD },
    )
    await vi.waitFor(async () =>
      expect(await assistantTexts(recovered)).toContain('Remember the milk.'),
    )
    await recovered.recover()
    const texts = await assistantTexts(recovered)
    expect(texts.filter((each) => each === 'Remember the milk.')).toEqual([
      'Remember the milk.',
    ])
  })
})
