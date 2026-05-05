import { beforeAll, describe, it } from 'vitest'
import { toolDefinition } from '@tanstack/ai'
import { grokText } from '../src'
import {
  codeExecutionTool,
  codeInterpreterTool,
  collectionsSearchTool,
  fileSearchTool,
  mcpTool,
  webSearchTool,
  xSearchTool,
} from '../src/tools'
import type { TextActivityOptions } from '@tanstack/ai/adapters'

function typedTools<TAdapter extends ReturnType<typeof grokText>>(
  adapter: TAdapter,
  tools: TextActivityOptions<TAdapter, undefined, true>['tools'],
) {
  return { adapter, tools }
}

beforeAll(() => {
  process.env['XAI_API_KEY'] = 'xai-test-dummy'
})

const userTool = toolDefinition({
  name: 'echo',
  description: 'echoes input',
  inputSchema: {
    type: 'object',
    properties: { msg: { type: 'string' } },
    required: ['msg'],
    additionalProperties: false,
  } as const,
}).server(async (args) => {
  const { msg } = args as { msg: string }
  return msg
})

describe('Grok per-model tool gating', () => {
  it('grok-4.3 accepts xAI server-side provider tools', () => {
    const adapter = grokText('grok-4.3')
    typedTools(adapter, [
      userTool,
      webSearchTool(),
      xSearchTool({ allowed_x_handles: ['xai'] }),
      codeExecutionTool(),
      codeInterpreterTool({ type: 'auto' }),
      fileSearchTool({ type: 'file_search', vector_store_ids: ['vs_123'] }),
      collectionsSearchTool({ vector_store_ids: ['vs_123'] }),
      mcpTool({
        server_label: 'my-server',
        server_url: 'https://example.com/mcp',
      }),
    ])
  })

  it('grok-4-2-non-reasoning accepts server-side provider tools', () => {
    const adapter = grokText('grok-4-2-non-reasoning')
    typedTools(adapter, [
      webSearchTool(),
      xSearchTool({ enable_image_understanding: true }),
      codeExecutionTool(),
      collectionsSearchTool({ vector_store_ids: ['vs_123'] }),
      mcpTool({
        server_label: 'my-server',
        server_url: 'https://example.com/mcp',
      }),
    ])
  })
})
