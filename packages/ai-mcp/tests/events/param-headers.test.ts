import { describe, expect, it } from 'vitest'
import {
  createEventHeaderLookup,
  encodeMcpHeaderValue,
  eventHeaderFault,
  mcpParamHeaders,
} from '../../src/events/param-headers'

const regionSchema = {
  type: 'object',
  properties: {
    region: { type: 'string', 'x-mcp-header': 'Region' },
    nested: {
      type: 'object',
      properties: {
        on: { type: 'boolean', 'x-mcp-header': 'On' },
      },
    },
    count: { type: 'integer', 'x-mcp-header': 'Count' },
  },
}

describe('eventHeaderFault', () => {
  it('accepts a schema with no annotations', () => {
    expect(eventHeaderFault({})).toBeUndefined()
    expect(eventHeaderFault(regionSchema)).toBeUndefined()
  })

  it('rejects an empty header name', () => {
    expect(
      eventHeaderFault({
        type: 'object',
        properties: { region: { type: 'string', 'x-mcp-header': '' } },
      }),
    ).toMatch(/non-empty/)
  })

  it('rejects a repeated header name', () => {
    expect(
      eventHeaderFault({
        type: 'object',
        properties: {
          a: { type: 'string', 'x-mcp-header': 'Region' },
          b: { type: 'string', 'x-mcp-header': 'region' },
        },
      }),
    ).toMatch(/unique/)
  })

  it('rejects type number', () => {
    expect(
      eventHeaderFault({
        type: 'object',
        properties: { n: { type: 'number', 'x-mcp-header': 'N' } },
      }),
    ).toMatch(/string, integer, or boolean/)
  })

  it('rejects an annotation under oneOf', () => {
    expect(
      eventHeaderFault({
        oneOf: [
          {
            type: 'object',
            properties: {
              region: { type: 'string', 'x-mcp-header': 'Region' },
            },
          },
        ],
      }),
    ).toMatch(/properties keys/)
  })
})

describe('mcpParamHeaders', () => {
  const lookup = createEventHeaderLookup()
  lookup.replace([{ name: 'incident.created', inputSchema: regionSchema }])

  it('encodes string, boolean, and integer arguments', () => {
    expect(
      lookup.headersFor('incident.created', {
        region: 'eu',
        nested: { on: false },
        count: 3,
      }),
    ).toEqual({
      'Mcp-Param-Region': 'eu',
      'Mcp-Param-On': 'false',
      'Mcp-Param-Count': '3',
    })
  })

  it('omits null, a missing value, and an unsafe integer', () => {
    expect(
      lookup.headersFor('incident.created', {
        region: null,
        count: Number.MAX_SAFE_INTEGER + 2,
      }),
    ).toEqual({})
  })

  it('base64-encodes a non-ASCII value', () => {
    const headers = mcpParamHeaders([{ path: ['city'], headerName: 'City' }], {
      city: '東京',
    })
    expect(headers['Mcp-Param-City']).toBe(encodeMcpHeaderValue('東京'))
    expect(headers['Mcp-Param-City']?.startsWith('=?base64?')).toBe(true)
  })

  it('ignores a schema that still has a fault', () => {
    const broken = createEventHeaderLookup()
    broken.replace([
      {
        name: 'incident.bad',
        inputSchema: {
          type: 'object',
          properties: { n: { type: 'number', 'x-mcp-header': 'N' } },
        },
      },
    ])
    expect(broken.headersFor('incident.bad', { n: 1 })).toEqual({})
  })
})
