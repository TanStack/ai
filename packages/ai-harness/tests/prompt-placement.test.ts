import { describe, expect, it } from 'vitest'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import { definePlugin } from '../src/plugins'
import { messageTexts, mockAdapter, text, toolCall } from './helpers'

describe('a plugin prompt with placement', () => {
  it('keeps the default in the system prompts, and puts a context prompt after the history', async () => {
    let step = 0
    const tick = toolDefinition({
      name: 'tick',
      description: 'Moves the step on',
      inputSchema: z.object({}),
    }).server(() => {
      step += 1
      return 'ticked'
    })
    const plugin = definePlugin({
      name: 'test/placement',
      setup: () => ({
        tools: [tick],
        prompts: [
          'Be brief.',
          {
            id: 'test/placement:step',
            text: () => `Current step: ${step}`,
            placement: 'context',
          },
        ],
      }),
    })
    const { adapter, calls } = mockAdapter([
      () => toolCall('tick', {}, 'c1'),
      () => text('done'),
    ])
    const harness = defineHarness({
      name: 'test/placement',
      adapter,
      plugins: () => [plugin],
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(harness, { threadId: 't1' })

    await session.send('go')

    expect(calls).toHaveLength(2)
    const [first, second] = calls
    // The default placement stays in the system prompts. The context prompt
    // is not there.
    expect(first.systemPrompts).toContain('Be brief.')
    expect(JSON.stringify(first.systemPrompts)).not.toContain('Current step')
    // The context prompt is the last message, after the history.
    expect(messageTexts(first).at(-1)).toBe('Current step: 0')
    expect(messageTexts(second).at(-1)).toBe('Current step: 1')
    // The text changed, but the system prompts and the history before it
    // are byte for byte the same: the cached prefix holds.
    expect(JSON.stringify(second.systemPrompts)).toBe(
      JSON.stringify(first.systemPrompts),
    )
    const history = first.messages.slice(0, -1)
    expect(JSON.stringify(second.messages.slice(0, history.length))).toBe(
      JSON.stringify(history),
    )
    // The log does not keep the context prompt.
    expect(JSON.stringify(await session.transcript())).not.toContain(
      'Current step',
    )
    await host.close()
  })
})
