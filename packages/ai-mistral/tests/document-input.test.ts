import { describe, expect, it } from 'vitest'
import { createMistralText } from '../src/adapters/text'
import type { DocumentPart } from '@tanstack/ai'

// `convertContentPartToMistral` is private; reach it directly so the test
// exercises the document mapping without standing up an HTTP mock. The
// `messageToWire` step then snake-cases `documentUrl` -> `document_url`.
const convertContentPart = (
  adapter: ReturnType<typeof createMistralText>,
  part: DocumentPart,
): unknown =>
  (
    adapter as unknown as {
      convertContentPartToMistral: (p: DocumentPart) => unknown
    }
  ).convertContentPartToMistral(part)

describe('mistral document content parts', () => {
  const adapter = createMistralText('mistral-small-latest', 'test-key')

  it('maps a hosted-URL document to a document_url part', () => {
    const part: DocumentPart = {
      type: 'document',
      source: { type: 'url', value: 'https://example.com/contract.pdf' },
    }

    expect(convertContentPart(adapter, part)).toEqual({
      type: 'document_url',
      documentUrl: 'https://example.com/contract.pdf',
    })
  })

  it('wraps inline base64 document bytes in a data: URL', () => {
    const part: DocumentPart = {
      type: 'document',
      source: {
        type: 'data',
        value: 'JVBERi0xLjQ=',
        mimeType: 'application/pdf',
      },
    }

    expect(convertContentPart(adapter, part)).toEqual({
      type: 'document_url',
      documentUrl: 'data:application/pdf;base64,JVBERi0xLjQ=',
    })
  })

  it('passes through a data: URL that is already formatted', () => {
    const part: DocumentPart = {
      type: 'document',
      source: {
        type: 'data',
        value: 'data:application/pdf;base64,JVBERi0xLjQ=',
        mimeType: 'application/pdf',
      },
    }

    expect(convertContentPart(adapter, part)).toEqual({
      type: 'document_url',
      documentUrl: 'data:application/pdf;base64,JVBERi0xLjQ=',
    })
  })
})
