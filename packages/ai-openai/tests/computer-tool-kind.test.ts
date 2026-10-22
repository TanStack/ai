/**
 * Type-level checks for the generic `'computer'` tool kind.
 *
 * A model that lists `computer` accepts the generic computer tool. A model
 * without it rejects it at compile time.
 */
import { beforeAll, describe, it } from 'vitest'
import { brandProviderTool } from '@tanstack/ai'
import { openaiText } from '../src'
import type { ProviderTool } from '@tanstack/ai'
import type { TextActivityOptions } from '@tanstack/ai/adapters'

function typedTools<TAdapter extends ReturnType<typeof openaiText>>(
  adapter: TAdapter,
  tools: TextActivityOptions<TAdapter, undefined, true>['tools'],
) {
  return { adapter, tools }
}

// The same brand the generic computer tool carries.
const computerTool = brandProviderTool<ProviderTool<string, 'computer'>>({
  name: 'computer',
  description: 'controls a computer',
})

// Adapter construction needs a key. No network calls happen here.
beforeAll(() => {
  process.env['OPENAI_API_KEY'] = 'sk-test-dummy'
})

describe('OpenAI computer tool kind', () => {
  it('gpt-6.1-sol accepts the computer tool', () => {
    typedTools(openaiText('gpt-6.1-sol'), [computerTool])
  })

  it('computer-use-preview accepts the computer tool', () => {
    typedTools(openaiText('computer-use-preview'), [computerTool])
  })

  it('gpt-4o rejects the computer tool', () => {
    typedTools(openaiText('gpt-4o'), [
      // @ts-expect-error - gpt-4o does not list computer_use
      computerTool,
    ])
  })

  it('o3-mini rejects the computer tool, because it has no image input', () => {
    typedTools(openaiText('o3-mini'), [
      // @ts-expect-error - o3-mini cannot read the screenshots
      computerTool,
    ])
  })
})
