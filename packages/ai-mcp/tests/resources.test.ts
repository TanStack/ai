import { describe, expect, it } from 'vitest'
import { createMCPClientFromTransport } from '../src/client'
import { mcpResourceToContentPart } from '../src/resources'
import { makeServerWithResource } from './helpers/in-memory-server'

describe('mcpResourceToContentPart', () => {
  it('converts a text content block to a TextPart', () => {
    const part = mcpResourceToContentPart({ uri: 'file:///x', text: 'hello' })
    expect(part).toEqual({ type: 'text', content: 'hello' })
  })

  it('converts a blob content block to a TextPart with binary placeholder', () => {
    const part = mcpResourceToContentPart({
      uri: 'file:///img.png',
      blob: 'abc123',
    })
    expect(part).toEqual({
      type: 'text',
      content: '[binary resource file:///img.png]',
    })
  })

  it('leaves the uri out of the placeholder for a blob without a uri', () => {
    const part = mcpResourceToContentPart({ blob: 'abc123' })
    expect(part).toEqual({ type: 'text', content: '[binary resource ]' })
  })

  it('falls back to JSON.stringify for unknown content', () => {
    const part = mcpResourceToContentPart({
      uri: 'file:///unknown',
      mimeType: 'application/octet-stream',
    })
    expect(part).toEqual({
      type: 'text',
      content:
        '{"uri":"file:///unknown","mimeType":"application/octet-stream"}',
    })
  })
})

describe('MCPClient resource methods (connected)', () => {
  it('resources() / readResource() round-trip via in-memory server', async () => {
    await using client = await createMCPClientFromTransport(
      (await makeServerWithResource()).clientTransport,
    )

    const [listed] = await client.resources()
    if (listed === undefined) throw new Error('The server listed no resource')

    const read = await client.readResource(listed.uri)
    const [contents] = read.contents
    if (contents === undefined) throw new Error('The resource has no contents')
    expect(mcpResourceToContentPart(contents)).toEqual({
      type: 'text',
      content: 'hello from resource',
    })
  })
})
