import { describe, expect, it } from 'vitest'
import {
  createHoverTarget,
  createHoverTargetFromDataAttributes,
  getHoverDataAttributes,
  hoverTargetMatchesElement,
  isMessageHighlighted,
  isMessageOrPartHighlighted,
  isPartHighlighted,
  parseJsonishValue,
  structuredOutputPartId,
  structuredOutputJsonItems,
  toolCallPartId,
  toolResultPartId,
} from '../src/components/hooks/preview-model'

describe('preview model', () => {
  it('matches hover targets against messages and parts', () => {
    const target = createHoverTarget({
      messageIds: ['message-1', 'message-1'],
      partIds: [toolCallPartId('call-1'), toolResultPartId('call-1')],
    })

    expect(target.messageIds).toEqual(['message-1'])
    expect(target.origin).toBe('timeline')
    expect(isMessageHighlighted('message-1', target)).toBe(true)
    expect(isMessageHighlighted('message-2', target)).toBe(false)
    expect(
      isPartHighlighted('message-2', toolCallPartId('call-1'), target),
    ).toBe(true)
    expect(isPartHighlighted('message-2', 'other-part', target)).toBe(false)
    expect(
      isMessageOrPartHighlighted(
        'message-2',
        [toolCallPartId('call-1')],
        target,
      ),
    ).toBe(true)
    expect(
      isMessageOrPartHighlighted('message-2', ['other-part'], target),
    ).toBe(false)
  })

  it('uses message highlights as a fallback for all message parts', () => {
    const target = createHoverTarget({
      messageIds: ['message-1'],
      origin: 'preview',
    })

    expect(target.origin).toBe('preview')
    expect(isPartHighlighted('message-1', 'any-part', target)).toBe(true)
  })

  it('creates and matches hover data attributes', () => {
    const target = createHoverTarget({
      messageIds: ['message-1'],
      partIds: [toolCallPartId('call-1')],
      origin: 'preview',
    })

    expect(getHoverDataAttributes(target)).toEqual({
      'data-ai-devtools-hover-message-ids': 'message-1',
      'data-ai-devtools-hover-part-ids': 'tool-call:call-1',
    })
    expect(
      hoverTargetMatchesElement(target, {
        messageIds: 'message-2,message-1',
        partIds: '',
      }),
    ).toBe(true)
    expect(
      hoverTargetMatchesElement(target, {
        messageIds: '',
        partIds: 'tool-call:call-1',
      }),
    ).toBe(true)
    expect(
      hoverTargetMatchesElement(target, {
        messageIds: 'message-2',
        partIds: 'tool-call:call-2',
      }),
    ).toBe(false)

    expect(
      createHoverTargetFromDataAttributes({
        messageIds: 'message-1,message-1',
        partIds: 'tool-call:call-1',
        origin: 'preview',
      }),
    ).toEqual({
      messageIds: ['message-1'],
      partIds: ['tool-call:call-1'],
      origin: 'preview',
    })
    expect(createHoverTargetFromDataAttributes({})).toBeNull()
  })

  it('parses JSON strings for tool payload rendering', () => {
    expect(parseJsonishValue('{"query":"devtools"}')).toEqual({
      query: 'devtools',
    })
    expect(parseJsonishValue('[1,2]')).toEqual([1, 2])
    expect(parseJsonishValue('plain text')).toBe('plain text')
    expect(parseJsonishValue({ already: 'object' })).toEqual({
      already: 'object',
    })
  })

  it('creates stable structured output part ids', () => {
    expect(structuredOutputPartId('message-1')).toBe(
      'structured-output:message-1',
    )
  })

  it('builds partial and raw structured output JSON items', () => {
    expect(
      structuredOutputJsonItems({
        data: { meal: 'pasta' },
        partial: { meal: 'pas' },
        raw: '{"meal":"pasta"}',
      }),
    ).toEqual([
      { label: 'Raw', value: '{"meal":"pasta"}' },
      { label: 'Partial', value: { meal: 'pas' } },
    ])
  })

  it('uses final data as the partial comparison value when no partial exists', () => {
    expect(
      structuredOutputJsonItems({
        data: { meal: 'pasta' },
        raw: '{"meal":"pasta"}',
      }),
    ).toEqual([
      { label: 'Raw', value: '{"meal":"pasta"}' },
      { label: 'Partial', value: { meal: 'pasta' } },
    ])
  })

  it('uses parsed raw output as partial while structured output is streaming', () => {
    expect(structuredOutputJsonItems({ raw: '{"meal":"pasta"}' })).toEqual([
      { label: 'Raw', value: '{"meal":"pasta"}' },
      { label: 'Partial', value: { meal: 'pasta' } },
    ])
  })
})
