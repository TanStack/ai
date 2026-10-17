import { describe, expect, it } from 'vitest'
import {
  classifyWebhookBody,
  listEventsResult,
  subscribeResult,
} from '../../src/events/wire'

function parse<T>(
  schema: {
    '~standard': {
      validate: (
        value: unknown,
      ) => { value: T } | { issues: Array<{ message: string }> }
    }
  },
  value: unknown,
) {
  return schema['~standard'].validate(value)
}

describe('listEventsResult', () => {
  it('accepts a webhook event descriptor', () => {
    const result = parse(listEventsResult, {
      events: [
        {
          name: 'a',
          delivery: ['webhook'],
          inputSchema: {},
          payloadSchema: true,
        },
      ],
    })
    expect(result).toEqual({
      value: {
        events: [
          {
            name: 'a',
            delivery: ['webhook'],
            inputSchema: {},
            payloadSchema: true,
          },
        ],
      },
    })
  })

  it('rejects delivery: []', () => {
    const result = parse(listEventsResult, {
      events: [
        {
          name: 'a',
          delivery: [],
          inputSchema: {},
          payloadSchema: true,
        },
      ],
    })
    expect('issues' in result).toBe(true)
  })

  it('accepts an unknown extra field (loose)', () => {
    const result = parse(listEventsResult, {
      events: [
        {
          name: 'a',
          delivery: ['webhook'],
          inputSchema: {},
          payloadSchema: true,
          extra: 1,
        },
      ],
      resultType: 'complete',
    })
    expect('value' in result).toBe(true)
  })
})

describe('subscribeResult', () => {
  it('maps a missing cursor to null and passes deliveryStatus through', () => {
    const result = parse(subscribeResult, {
      id: 'sub_1',
      refreshBefore: null,
      truncated: false,
      deliveryStatus: { active: true, lastError: null },
    })
    expect(result).toEqual({
      value: {
        id: 'sub_1',
        refreshBefore: null,
        cursor: null,
        truncated: false,
        deliveryStatus: { active: true, lastError: null },
      },
    })
  })

  it('requires truncated: boolean', () => {
    const result = parse(subscribeResult, {
      id: 'sub_1',
      refreshBefore: null,
    })
    expect('issues' in result).toBe(true)
  })

  it('rejects refreshBefore: tomorrow', () => {
    const result = parse(subscribeResult, {
      id: 'sub_1',
      refreshBefore: 'tomorrow',
      truncated: false,
    })
    expect('issues' in result).toBe(true)
  })
})

describe('classifyWebhookBody', () => {
  it('classifies a gap control', () => {
    expect(classifyWebhookBody({ type: 'gap', cursor: 'c' })).toEqual({
      kind: 'gap',
      cursor: 'c',
    })
  })

  it('rejects a gap without cursor', () => {
    expect(classifyWebhookBody({ type: 'gap' }).kind).toBe('invalid')
  })

  it('classifies verification', () => {
    expect(
      classifyWebhookBody({ type: 'verification', challenge: 'n' }),
    ).toEqual({ kind: 'verification', challenge: 'n' })
  })

  it('classifies terminated', () => {
    expect(
      classifyWebhookBody({
        type: 'terminated',
        error: { code: -32024, message: 'x' },
      }),
    ).toEqual({
      kind: 'terminated',
      error: { code: -32024, message: 'x' },
    })
  })

  it('rejects an unknown control type', () => {
    expect(classifyWebhookBody({ type: 'other' }).kind).toBe('invalid')
  })

  it('classifies an event', () => {
    expect(
      classifyWebhookBody({
        eventId: 'e',
        name: 'n',
        timestamp: '2026-10-17T00:00:00Z',
        data: {},
      }),
    ).toEqual({
      kind: 'event',
      event: {
        eventId: 'e',
        name: 'n',
        timestamp: '2026-10-17T00:00:00Z',
        data: {},
      },
    })
  })

  it('rejects an event whose data is an array', () => {
    expect(
      classifyWebhookBody({
        eventId: 'e',
        name: 'n',
        timestamp: '2026-10-17T00:00:00Z',
        data: [],
      }).kind,
    ).toBe('invalid')
  })
})
