import { describe, expect, it } from 'vitest'
import { createMCPClientFromTransport } from '../src/client'
import { mcpResourceToContentPart } from '../src/resources'
import { makeServerWithResource } from './helpers/in-memory-server'

describe('mcpResourceToContentPart', () => {
  it('converts a text content block to a TextPart', () => {
    const part = mcpResourceToContentPart({ uri: 'file:///x', text: 'hello' })
    expect(part?.type).toBe('text')
    expect((part as { type: 'text'; content: string }).content).toBe('hello')
  })

  it('converts an image blob to an ImagePart', () => {
    const part = mcpResourceToContentPart({
      uri: 'file:///img.png',
      mimeType: 'image/png',
      blob: 'abc123',
    })
    expect(part?.type).toBe('image')
    expect(part).toMatchObject({
      type: 'image',
      source: { type: 'data', value: 'abc123', mimeType: 'image/png' },
    })
  })

  it('converts an audio blob to an AudioPart', () => {
    const part = mcpResourceToContentPart({
      uri: 'file:///a.wav',
      mimeType: 'audio/wav',
      blob: 'YmFzZQ==',
    })
    expect(part?.type).toBe('audio')
  })

  it('converts a PDF blob to a DocumentPart', () => {
    const part = mcpResourceToContentPart({
      uri: 'file:///doc.pdf',
      mimeType: 'application/pdf',
      blob: 'cGRm',
    })
    expect(part?.type).toBe('document')
  })

  it('falls back to a text placeholder when mime is missing', () => {
    const part = mcpResourceToContentPart({
      uri: 'file:///img.png',
      blob: 'abc123',
    })
    expect(part?.type).toBe('text')
    expect((part as { type: 'text'; content: string }).content).toBe(
      '[binary resource file:///img.png]',
    )
  })

  it('omits rejected blobs when onReject is omit', () => {
    const part = mcpResourceToContentPart(
      { uri: 'file:///x.bin', blob: 'abc', mimeType: 'application/octet-stream' },
      { onReject: 'omit' },
    )
    expect(part).toBeNull()
  })

  it('throws when onReject is throw', () => {
    expect(() =>
      mcpResourceToContentPart(
        { uri: 'file:///x.bin', blob: 'abc' },
        { onReject: 'throw' },
      ),
    ).toThrow(/rejected/)
  })

  it('rejects oversize blobs', () => {
    const part = mcpResourceToContentPart(
      {
        uri: 'file:///big.png',
        mimeType: 'image/png',
        blob: 'AAAA',
      },
      { maxBytes: 1 },
    )
    expect(part?.type).toBe('text')
  })

  it('falls back to JSON.stringify for unknown content', () => {
    const input = {
      uri: 'file:///unknown',
      mimeType: 'application/octet-stream',
    }
    const part = mcpResourceToContentPart(input)
    expect(part?.type).toBe('text')
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
    expect(part?.type).toBe('text')
  })
})
