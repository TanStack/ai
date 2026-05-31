import { describe, expect, it } from 'vitest'
import { toToolConfig } from '../../src/converse/tool-converter'

describe('toToolConfig', () => {
  it('maps JSON-schema tools to Converse toolSpec', () => {
    const cfg = toToolConfig(
      [{ name: 'getX', description: 'd', inputSchema: { type: 'object', properties: {} } }],
      'auto',
    )
    expect(cfg?.tools?.[0]).toEqual({
      toolSpec: {
        name: 'getX',
        description: 'd',
        inputSchema: { json: { type: 'object', properties: {} } },
      },
    })
    expect(cfg?.toolChoice).toEqual({ auto: {} })
  })

  it('maps required -> any and a named tool -> tool', () => {
    expect(toToolConfig([{ name: 'a', inputSchema: {} }], 'required')?.toolChoice).toEqual({ any: {} })
    expect(
      toToolConfig([{ name: 'a', inputSchema: {} }], { type: 'tool', name: 'a' })?.toolChoice,
    ).toEqual({ tool: { name: 'a' } })
  })

  it('omits description when not provided', () => {
    const cfg = toToolConfig([{ name: 'a', inputSchema: {} }], 'auto')
    expect(cfg?.tools?.[0]).toEqual({
      toolSpec: { name: 'a', inputSchema: { json: {} } },
    })
  })

  it('returns undefined when there are no tools', () => {
    expect(toToolConfig([], 'auto')).toBeUndefined()
  })

  it('returns undefined toolChoice for "none" (caller omits tools instead)', () => {
    const cfg = toToolConfig([{ name: 'a', inputSchema: {} }], 'none')
    expect(cfg?.toolChoice).toBeUndefined()
  })
})
