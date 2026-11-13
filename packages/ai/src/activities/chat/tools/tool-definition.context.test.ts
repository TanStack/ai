import { describe, expect, it } from 'vitest'
import { toolDefinition } from './tool-definition'
import { aboveTokens, truncateHeadTail } from './projection-builders'
import type { ToolContextPolicy } from './tool-definition'

const context: ToolContextPolicy = {
  result: {
    fields: {
      content: aboveTokens(1500, truncateHeadTail({ maxTokens: 750 })),
    },
    includeErrors: false,
  },
}

describe('toolDefinition context adornment (T1)', () => {
  const def = toolDefinition({
    name: 'read_file',
    description: 'Read a file',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
    context,
  })

  it('carries context on the definition', () => {
    expect(def.context).toEqual(context)
  })

  it('threads context through .server()', () => {
    const server = def.server(async () => ({ content: 'x' }))
    expect(server.context).toEqual(context)
  })

  it('threads context through .client()', () => {
    const client = def.client()
    expect(client.context).toEqual(context)
  })

  it('a tool with no context is unaffected', () => {
    const plain = toolDefinition({ name: 'noop', description: 'x' })
    expect(plain.context).toBeUndefined()
    expect(plain.server(async () => 'y').context).toBeUndefined()
  })
})
