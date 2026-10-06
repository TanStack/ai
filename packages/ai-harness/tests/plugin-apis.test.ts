import { describe, expect, it, vi } from 'vitest'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, definePlugin } from '../src'
import { mockAdapter, text } from './helpers'
import type { AnyTextAdapter } from '@tanstack/ai'
import type { PluginSessionApi } from '../src'

/** Open a session with a plugin that hands out its session API. */
async function openWithApi(adapter: AnyTextAdapter) {
  const apis: Array<PluginSessionApi> = []
  const probe = definePlugin({
    name: 'test/probe',
    setup: (ctx) => {
      apis.push(ctx.session)
    },
  })
  const host = createHarnessHost({ persistence: memoryPersistence() })
  const session = await host.open(
    defineHarness({ name: 'test/plugin-apis', adapter, plugins: () => [probe] }),
    { threadId: 't' },
  )
  const api = apis[0]
  if (!api) throw new Error('The probe plugin was not set up.')
  return { host, session, api }
}

describe('ctx.session.note', () => {
  it('adds an assistant note to the transcript and starts no turn', async () => {
    const { adapter, calls } = mockAdapter([() => text('Nice.')])
    const { host, session, api } = await openWithApi(adapter)

    await api.note('Build finished.')
    expect(await api.transcript()).toMatchObject([
      { role: 'assistant', content: 'Build finished.' },
    ])

    // The next model call is the user's prompt, after the note.
    await session.prompt('Any news?')
    expect(calls).toHaveLength(1)
    expect(calls[0].messages).toMatchObject([
      { role: 'assistant', content: 'Build finished.' },
      { role: 'user', content: 'Any news?' },
    ])
    await host.close()
  })

  it('starts a turn after the note with wake', async () => {
    const { adapter, calls } = mockAdapter([() => text('On it.')])
    const { host, session, api } = await openWithApi(adapter)

    await api.note('Build finished.', { wake: true })
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0].messages).toMatchObject([
      { role: 'assistant', content: 'Build finished.' },
      { role: 'user', content: 'Build finished.' },
    ])
    await vi.waitFor(() => expect(session.snapshot().status).toBe('idle'))
    await host.close()
  })
})

describe('prepareTools', () => {
  it('gets the model id of the adapter the turn runs with', async () => {
    const { adapter } = mockAdapter([])
    const picked = mockAdapter([() => text('ok')])
    const models: Array<string> = []
    const plugin = definePlugin({
      name: 'test/pick',
      setup: () => ({
        adapter: () => ({ ...picked.adapter, model: 'picked-model' }),
        prepareTools: ({ tools, model }) => {
          models.push(model)
          return tools
        },
      }),
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({ name: 'test/model', adapter, plugins: () => [plugin] }),
      { threadId: 't' },
    )

    await session.prompt('go')
    expect(models).toEqual(['picked-model'])
    expect(picked.calls).toHaveLength(1)
    await host.close()
  })
})
