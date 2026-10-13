import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { chat } from '../src'
import { createMockAdapter, ev, serverTool } from './test-utils'
import type {
  ChatMiddleware,
  PromptCacheOptions,
  ResolvedPromptCache,
} from '../src'

const toolTurn = (toolCallId: string) => [
  ev.runStarted(),
  ev.toolStart(toolCallId, 'lookup'),
  ev.toolArgs(toolCallId, '{}'),
  ev.toolEnd(toolCallId),
  ev.runFinished('tool_calls'),
]

const stopTurn = [
  ev.runStarted(),
  ev.textContent('Done'),
  ev.runFinished('stop'),
]

/** Sets a long cache with key `k` at the second model call only. */
const longAtSecondCall: ChatMiddleware = {
  name: 'long-at-second-call',
  onConfig: (ctx) => {
    if (ctx.phase === 'beforeModel' && ctx.iteration === 1) {
      return { promptCache: { retention: 'long', key: 'k' } }
    }
    return undefined
  },
}

/** Run one chat() call with three model calls. Give back each call's promptCache. */
async function promptCacheOfThreeCalls(options: {
  threadId: string
  promptCache?: PromptCacheOptions
  middleware: Array<ChatMiddleware>
}) {
  const { adapter, calls } = createMockAdapter({
    iterations: [toolTurn('tc-1'), toolTurn('tc-2'), stopTurn],
  })
  await chat({
    adapter,
    messages: [{ role: 'user', content: 'Hi' }],
    tools: [serverTool('lookup', () => ({ ok: true }))],
    stream: false,
    ...options,
  })
  return calls.map((call) => call.promptCache)
}

describe('middleware onConfig promptCache', () => {
  it('sets the cache from the second model call and keeps it for the third', async () => {
    const seen = await promptCacheOfThreeCalls({
      threadId: 't1',
      middleware: [longAtSecondCall],
    })
    expect(seen).toStrictEqual([
      { retention: 'short', key: 't1' },
      { retention: 'long', key: 'k' },
      { retention: 'long', key: 'k' },
    ])
  })

  it('starts a later chat() call from its own option', async () => {
    await promptCacheOfThreeCalls({
      threadId: 't1',
      middleware: [longAtSecondCall],
    })
    const seen = await promptCacheOfThreeCalls({
      threadId: 't2',
      promptCache: 'none',
      middleware: [longAtSecondCall],
    })
    expect(seen[0]).toStrictEqual({ retention: 'none', key: 't2' })
  })

  it('gives onConfig the current promptCache', async () => {
    const seen: Array<ResolvedPromptCache | undefined> = []
    const { adapter } = createMockAdapter({ iterations: [stopTurn] })
    await chat({
      adapter,
      messages: [{ role: 'user', content: 'Hi' }],
      threadId: 't1',
      promptCache: 'long',
      stream: false,
      middleware: [
        {
          name: 'recorder',
          onConfig: (ctx, config) => {
            if (ctx.phase === 'beforeModel') seen.push(config.promptCache)
          },
        },
      ],
    })
    expect(seen).toStrictEqual([{ retention: 'long', key: 't1' }])
  })

  it('reaches structuredOutput when onConfig sets it at that phase', async () => {
    let seen: ResolvedPromptCache | undefined
    const { adapter } = createMockAdapter({
      structuredOutput: async (options) => {
        seen = options.chatOptions.promptCache
        return { data: { name: 'Ada' }, rawText: '{"name":"Ada"}' }
      },
    })
    const result = await chat({
      adapter,
      messages: [{ role: 'user', content: 'Who?' }],
      threadId: 't1',
      outputSchema: z.object({ name: z.string() }),
      middleware: [
        {
          name: 'long-at-structured-output',
          onConfig: (ctx) =>
            ctx.phase === 'structuredOutput'
              ? { promptCache: { retention: 'long', key: 'k' } }
              : undefined,
        },
      ],
    })
    expect(result).toEqual({ name: 'Ada' })
    expect(seen).toStrictEqual({ retention: 'long', key: 'k' })
  })
})
