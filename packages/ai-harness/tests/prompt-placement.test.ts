import { describe, expect, it } from 'vitest'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import { createExtensionPoint } from '../src/extensions'
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

  it('drops the context prompt and the extension items of a plugin that the thread removes', async () => {
    const Rules = createExtensionPoint<string>('test/placement-rules')
    const notes = definePlugin({
      name: 'test/notes',
      setup: () => ({
        prompts: [
          { id: 'test/notes:on', text: 'Notes on.', placement: 'context' },
        ],
        contribute: [Rules.item('notes rule')],
      }),
    })
    // Reads the rules at each model call, after setup: the cached list.
    const reader = definePlugin({
      name: 'test/reader',
      setup: (ctx) => ({
        prompts: [
          {
            id: 'test/reader:rules',
            text: () => `Rules: ${ctx.collect(Rules).join(', ') || 'none'}`,
            placement: 'context',
          },
        ],
      }),
    })
    const { adapter, calls } = mockAdapter(() => text('ok'))
    const harness = defineHarness({
      name: 'test/placement-remove',
      adapter,
      plugins: () => [notes, reader],
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(harness, { threadId: 't1' })

    await session.send('One.')
    await session.configure({
      settings: { plugins: { remove: ['test/notes'] } },
    })
    await session.send('Two.')

    expect(calls).toHaveLength(2)
    expect(messageTexts(calls[0]).at(-1)).toBe('Notes on.\n\nRules: notes rule')
    // The removed plugin adds no context prompt, and `collect` does not give
    // its items from the list that it cached before the change.
    expect(messageTexts(calls[1]).at(-1)).toBe('Rules: none')
    expect(JSON.stringify(calls[1].messages)).not.toContain('Notes on.')
    await host.close()
  })
})
