import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { chatPlugin, definePlugin, generationPlugin } from '../src/index.js'
import type { ChatPluginCallback } from '../src/types.js'
import type { ChatStream } from '@tanstack/ai'

// Compile-only: a streaming chat callback (the shape `chat()` returns by
// default) must be assignable to `ChatPluginCallback` without a cast.
const _chatCbAssignable: ChatPluginCallback = (_req) =>
  undefined as unknown as ChatStream
void _chatCbAssignable

function runAgentBody(pluginName: string, extra: Record<string, unknown> = {}) {
  return {
    threadId: 't1',
    runId: 'r1',
    state: {},
    messages: [],
    tools: [],
    context: [],
    forwardedProps: { plugin: pluginName, ...extra },
  }
}

function req(body: unknown) {
  return new Request('http://x/api/plugin', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function readSse(res: Response): Promise<Array<any>> {
  const text = await res.text()
  return text
    .split('\n\n')
    .map((l) => l.replace(/^data: /, '').trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l))
}

const emptyChat = () =>
  chatPlugin(async function* (r: any) {
    yield {
      type: 'RUN_STARTED',
      threadId: r.threadId,
      runId: r.runId,
    } as any
    yield {
      type: 'RUN_FINISHED',
      threadId: r.threadId,
      runId: r.runId,
    } as any
  } as any)

describe('definePlugin', () => {
  it('is inert: does not invoke any plugin at define time', () => {
    const execute = vi.fn()
    const callback = vi.fn()
    const def = definePlugin({
      primaryChat: chatPlugin(callback as any),
      banner: generationPlugin({ execute }),
    })
    expect(execute).not.toHaveBeenCalled()
    expect(callback).not.toHaveBeenCalled()
    expect(def.plugins.slice().sort()).toEqual(['banner', 'primaryChat'])
    expect(def.pluginKinds).toEqual({ primaryChat: 'chat', banner: 'one-shot' })
    expect(typeof def.handler).toBe('function')
  })

  it('is exported from the toolkit entry', async () => {
    const mod = await import('../src/index.js')
    expect(typeof mod.definePlugin).toBe('function')
    expect(typeof mod.generationPlugin).toBe('function')
    expect(typeof mod.chatPlugin).toBe('function')
  }, 30000)
})

describe('plugin.handler routing', () => {
  it('400s on an unknown plugin', async () => {
    const def = definePlugin({ primaryChat: emptyChat() })
    const res = await def.handler(req(runAgentBody('banner')))
    expect(res.status).toBe(400)
  })

  it('400s on an inherited Object.prototype key used as plugin name', async () => {
    const def = definePlugin({ primaryChat: emptyChat() })
    const res = await def.handler(req(runAgentBody('toString')))
    expect(res.status).toBe(400)
  })

  it('routes a chat plugin and streams the callback iterable', async () => {
    const def = definePlugin({ primaryChat: emptyChat() })
    const res = await def.handler(req(runAgentBody('primaryChat')))
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    const chunks = await readSse(res)
    expect(chunks[0].type).toBe('RUN_STARTED')
  })

  it('supports multiple independently-routed chat plugins', async () => {
    const seen: Array<string> = []
    const mkChat = (label: string) =>
      chatPlugin(async function* (r: any) {
        seen.push(label)
        yield {
          type: 'RUN_STARTED',
          threadId: r.threadId,
          runId: r.runId,
        } as any
      } as any)
    const def = definePlugin({
      primaryChat: mkChat('primary'),
      summaryChat: mkChat('summary'),
    })
    await (await def.handler(req(runAgentBody('summaryChat')))).text()
    expect(seen).toEqual(['summary'])
    await (await def.handler(req(runAgentBody('primaryChat')))).text()
    expect(seen).toEqual(['summary', 'primary'])
  })
})

describe('one-shot plugins', () => {
  it('wraps the execute result as a generation:result CUSTOM event', async () => {
    const def = definePlugin({
      banner: generationPlugin({
        input: z.object({ prompt: z.string() }),
        execute: async ({ input }) => ({ url: `generated:${input.prompt}` }),
      }),
    })
    const res = await def.handler(
      req(runAgentBody('banner', { prompt: 'a fox' })),
    )
    const chunks = await readSse(res)
    expect(chunks[0].type).toBe('RUN_STARTED')
    const custom = chunks.find((c) => c.type === 'CUSTOM')
    expect(custom.name).toBe('generation:result')
    expect(custom.value.url).toBe('generated:a fox')
    expect(chunks.at(-1).type).toBe('RUN_FINISHED')
  })

  it('validates input against the plugin schema and 400s with issues', async () => {
    const execute = vi.fn()
    const def = definePlugin({
      banner: generationPlugin({
        input: z.object({ prompt: z.string() }),
        execute,
      }),
    })
    const res = await def.handler(req(runAgentBody('banner', { prompt: 42 })))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toBe('Invalid plugin input')
    expect(body.plugin).toBe('banner')
    expect(body.issues.length).toBeGreaterThan(0)
    expect(execute).not.toHaveBeenCalled()
  })

  it('gives execute the validated envelope and an abort signal', async () => {
    const def = definePlugin({
      echo: generationPlugin({
        execute: async (r) => ({
          threadId: r.threadId,
          runId: r.runId,
          state: r.state,
          hasSignal: r.signal instanceof AbortSignal,
          plugin: r.forwardedProps.plugin,
        }),
      }),
    })
    const body = runAgentBody('echo', { anything: true })
    const chunks = await readSse(await def.handler(req(body)))
    const custom = chunks.find((c) => c.type === 'CUSTOM')
    expect(custom.value).toEqual({
      threadId: 't1',
      runId: 'r1',
      state: {},
      hasSignal: true,
      plugin: 'echo',
    })
  })

  it('emits RUN_ERROR when execute rejects', async () => {
    const def = definePlugin({
      boom: generationPlugin({
        execute: async () => {
          throw new Error('kaboom')
        },
      }),
    })
    const chunks = await readSse(await def.handler(req(runAgentBody('boom'))))
    const error = chunks.find((c) => c.type === 'RUN_ERROR')
    expect(error.message).toContain('kaboom')
    expect(chunks.find((c) => c.type === 'RUN_FINISHED')).toBeUndefined()
  })
})
