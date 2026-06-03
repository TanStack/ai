import { describe, expect, it } from 'vitest'
import { mcpResourceToContentPart } from '../src/resources'

describe('mcpResourceToContentPart', () => {
  it('converts a text content block to a TextPart', () => {
    const part = mcpResourceToContentPart({ uri: 'file:///x', text: 'hello' })
    expect(part.type).toBe('text')
    expect((part as { type: 'text'; content: string }).content).toBe('hello')
  })

  it('converts a blob content block to a TextPart with binary placeholder', () => {
    const part = mcpResourceToContentPart({
      uri: 'file:///img.png',
      blob: 'abc123',
    })
    expect(part.type).toBe('text')
    expect((part as { type: 'text'; content: string }).content).toBe(
      '[binary resource file:///img.png]',
    )
  })

  it('falls back to JSON.stringify for unknown content', () => {
    const input = { uri: 'file:///unknown', mimeType: 'application/octet-stream' }
    const part = mcpResourceToContentPart(input)
    expect(part.type).toBe('text')
    expect((part as { type: 'text'; content: string }).content).toBe(
      JSON.stringify(input),
    )
  })
})
