import { describe, expect, it } from 'vitest'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import { createExtensionPoint } from '../src/extensions'
import { definePlugin } from '../src/plugins'
import { mockAdapter, text, toolCall } from './helpers'
import type { SystemPrompt } from '@tanstack/ai'

/** The text of the last system prompt of a model call. */
const lastSystem = (call: { systemPrompts?: Array<SystemPrompt> }) => {
  const prompt = call.systemPrompts?.at(-1)
  return typeof prompt === 'string' ? prompt : prompt?.content
}

describe('a plugin prompt with placement', () => {
  it('keeps the default in the system prompts, and puts a context prompt last, once per call', async () => {
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
    // is the last system prompt, not a user message.
    expect(first.systemPrompts).toContain('Be brief.')
    expect(lastSystem(first)).toBe('Current step: 0')
    expect(lastSystem(second)).toBe('Current step: 1')
    expect(JSON.stringify(first.messages)).not.toContain('Current step')
    // The second call replaces the prompt of the first. The system prompts
    // before it are byte for byte the same.
    expect(second.systemPrompts).toHaveLength(first.systemPrompts.length)
    expect(JSON.stringify(second.systemPrompts.slice(0, -1))).toBe(
      JSON.stringify(first.systemPrompts.slice(0, -1)),
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
    await session.updateThreadSettings({
      settings: { plugins: { remove: ['test/notes'] } },
    })
    await session.send('Two.')

    expect(calls).toHaveLength(2)
    expect(lastSystem(calls[0])).toBe('Notes on.\n\nRules: notes rule')
    // The removed plugin adds no context prompt, and `collect` does not give
    // its items from the list that it cached before the change.
    expect(lastSystem(calls[1])).toBe('Rules: none')
    expect(JSON.stringify(calls[1].systemPrompts)).not.toContain('Notes on.')
    await host.close()
  })
})
