import { describe, expect, it } from 'vitest'
import { createMCPClientFromTransport } from '../src/client'
import { mcpResourceToContentPart } from '../src/resources'
import { makeServerWithResource } from './helpers/in-memory-server'

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
    const input = {
      uri: 'file:///unknown',
      mimeType: 'application/octet-stream',
    }
    const part = mcpResourceToContentPart(input)
    expect(part.type).toBe('text')
    expect((part as { type: 'text'; content: string }).content).toBe(
      JSON.stringify(input),
    )
  })
})

describe('MCPClient resource methods (connected)', () => {
  it('resources() / readResource() round-trip via in-memory server', async () => {
    await using client = await createMCPClientFromTransport(
      (await makeServerWithResource()).clientTransport,
    )

    const list = await client.resources()
    expect(list.length).toBeGreaterThan(0)

    const read = await client.readResource(list[0]!.uri)
    const part = mcpResourceToContentPart(read.contents[0]!)
    expect(part.type).toBe('text')
  })
})
