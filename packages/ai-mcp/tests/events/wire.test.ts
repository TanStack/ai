import { describe, expect, it } from 'vitest'
import type { StandardSchemaV1Sync } from '@modelcontextprotocol/client'
import {
  classifyWebhookBody,
  listEventsResult,
  subscribeResult,
} from '../../src/events/wire'

function parse<T>(schema: StandardSchemaV1Sync<unknown, T>, value: unknown) {
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

  it('treats a gap with no cursor as cursor null', () => {
    expect(classifyWebhookBody({ type: 'gap' })).toEqual({
      kind: 'gap',
      cursor: null,
    })
    expect(classifyWebhookBody({ type: 'gap', cursor: null })).toEqual({
      kind: 'gap',
      cursor: null,
    })
  })

  it('rejects a gap whose cursor is not a string', () => {
    expect(classifyWebhookBody({ type: 'gap', cursor: 1 }).kind).toBe('invalid')
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

  it('keeps _meta when it is a JSON object', () => {
    expect(
      classifyWebhookBody({
        eventId: 'e',
        name: 'n',
        timestamp: '2026-10-17T00:00:00Z',
        data: {},
        _meta: { trace: 'a' },
      }),
    ).toEqual({
      kind: 'event',
      event: {
        eventId: 'e',
        name: 'n',
        timestamp: '2026-10-17T00:00:00Z',
        data: {},
        _meta: { trace: 'a' },
      },
    })
  })

  it('drops _meta when it is not an object', () => {
    const result = classifyWebhookBody({
      eventId: 'e',
      name: 'n',
      timestamp: '2026-10-17T00:00:00Z',
      data: {},
      _meta: 'nope',
    })
    expect(result.kind).toBe('event')
    if (result.kind === 'event') expect(result.event._meta).toBeUndefined()
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
