import { describe, expect, it } from 'vitest'
import {
  appendOutputSchemaInstruction,
  parseJsonFromAssistantText,
} from '../src/utilities/structured-output-text'

describe('parseJsonFromAssistantText', () => {
  it('parses a bare object', () => {
    expect(parseJsonFromAssistantText('{"a":1}')).toEqual({ a: 1 })
  })

  it('strips a json fence', () => {
    expect(parseJsonFromAssistantText('```json\n{"a":1}\n```')).toEqual({
      a: 1,
    })
  })

  it('strips a bare fence', () => {
    expect(parseJsonFromAssistantText('```\n{"a":1}\n```')).toEqual({ a: 1 })
  })

  it('throws on prose', () => {
    expect(() => parseJsonFromAssistantText('not json')).toThrow()
  })

  it('takes the last object after assistant prose', () => {
    expect(
      parseJsonFromAssistantText('I\'ll read the README.\n{"a":1}'),
    ).toEqual({ a: 1 })
  })

  it('takes the last fenced object after prose', () => {
    expect(
      parseJsonFromAssistantText('Looking around.\n```json\n{"a":2}\n```'),
    ).toEqual({ a: 2 })
  })

  it('appends the schema instruction', () => {
    const next = appendOutputSchemaInstruction('Look around.', {
      type: 'object',
    })
    expect(next).toContain('Look around.')
    expect(next).toContain('"type":"object"')
  })
})
