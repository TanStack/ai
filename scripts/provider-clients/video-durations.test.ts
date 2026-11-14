import { describe, expect, it } from 'vitest'
import { operationVideoDurations } from './video-durations.ts'

const doc = (properties: Record<string, unknown>) => ({
  components: {
    schemas: { Seconds: { type: 'string', enum: ['4', '8', '12'] } },
  },
  paths: {
    '/videos': {
      post: {
        requestBody: {
          content: {
            'multipart/form-data': { schema: { type: 'object', properties } },
          },
        },
      },
    },
  },
})

describe('operationVideoDurations', () => {
  it('gives every model enum value the referenced seconds enum', () => {
    const durations = operationVideoDurations(
      doc({
        model: {
          anyOf: [{ type: 'string' }, { enum: ['sora-2', 'sora-2-pro'] }],
        },
        seconds: { $ref: '#/components/schemas/Seconds' },
      }),
      '/videos',
    )
    expect(Object.fromEntries(durations)).toEqual({
      'sora-2': { kind: 'discrete', values: ['4', '8', '12'] },
      'sora-2-pro': { kind: 'discrete', values: ['4', '8', '12'] },
    })
  })

  it('reads a duration range', () => {
    const durations = operationVideoDurations(
      doc({
        model: { enum: ['grok-imagine-video'] },
        duration: { type: 'integer', minimum: 1, maximum: 15 },
      }),
      '/videos',
    )
    expect(durations.get('grok-imagine-video')).toEqual({
      kind: 'range',
      min: 1,
      max: 15,
    })
  })

  it('throws when the duration input is gone', () => {
    expect(() =>
      operationVideoDurations(doc({ model: { enum: ['a'] } }), '/videos'),
    ).toThrow('No model enum and duration on POST /videos')
  })
})
