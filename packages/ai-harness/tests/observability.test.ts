import { describe, expect, it } from 'vitest'
import { noopTracer, parseTraceparent, withSpan } from '../src/observability'
import { fakeSpan } from './helpers'
import type { Tracer } from '@opentelemetry/api'

const TRACEPARENT = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'

/** A tracer that records what the harness calls on each span. */
function recordingTracer() {
  const spans: Array<{ name: string; options: unknown; calls: Array<string> }> =
    []
  const tracer: Pick<Tracer, 'startSpan'> = {
    startSpan: (name, options) => {
      const calls: Array<string> = []
      spans.push({ name, options, calls })
      return fakeSpan(
        { traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), traceFlags: 1 },
        {
          setAttribute: (key) => calls.push(`setAttribute:${key}`),
          setStatus: ({ code, message }) =>
            calls.push(`setStatus:${code}:${message}`),
          recordException: (error) =>
            calls.push(`recordException:${String(error)}`),
          end: () => calls.push('end'),
        },
      )
    },
  }
  return { tracer, spans }
}

describe('traceparent', () => {
  it('reads a valid value', () => {
    const context = parseTraceparent(TRACEPARENT)
    expect(context).toEqual({
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      spanId: '00f067aa0ba902b7',
      traceFlags: 1,
      isRemote: true,
    })
  })

  it.each([
    ['not a string', 42],
    ['the wrong shape', 'abc'],
    ['upper case hex', TRACEPARENT.toUpperCase()],
    ['version ff', TRACEPARENT.replace(/^00/, 'ff')],
    ['an extra field on version 00', `${TRACEPARENT}-x`],
    ['a zero trace id', `00-${'0'.repeat(32)}-00f067aa0ba902b7-01`],
    [
      'a zero span id',
      `00-4bf92f3577b34da6a3ce929d0e0e4736-${'0'.repeat(16)}-01`,
    ],
  ])('ignores %s', (_name, value) => {
    expect(parseTraceparent(value)).toBeUndefined()
  })

  it('reads the four fields of a later version that has more', () => {
    expect(
      parseTraceparent(`${TRACEPARENT.replace(/^00/, '01')}-extra`),
    ).toMatchObject({ spanId: '00f067aa0ba902b7' })
  })
})

describe('withSpan', () => {
  it('passes the options to startSpan and ends the span', async () => {
    const { tracer, spans } = recordingTracer()
    const link = { context: parseTraceparent(TRACEPARENT)! }
    const result = await withSpan(
      {
        tracer,
        name: 'harness.operation',
        attributes: { 'harness.kind': 'chat' },
        links: [link],
        startTime: 5,
      },
      () => 'done',
    )
    expect(result).toBe('done')
    expect(spans).toEqual([
      {
        name: 'harness.operation',
        options: {
          attributes: { 'harness.kind': 'chat' },
          links: [link],
          startTime: 5,
        },
        calls: ['end'],
      },
    ])
  })

  it('records the error, sets the error status, ends the span, and throws on', async () => {
    const { tracer, spans } = recordingTracer()
    await expect(
      withSpan({ tracer, name: 'harness.recovery' }, async () => {
        throw new Error('boom')
      }),
    ).rejects.toThrow('boom')
    expect(spans[0]?.calls).toEqual([
      'recordException:Error: boom',
      'setStatus:2:boom',
      'end',
    ])
  })
})

describe('noopTracer', () => {
  it('gives one shared span, so nothing allocates per span', () => {
    const first = noopTracer.startSpan('a')
    expect(noopTracer.startSpan('b')).toBe(first)
    expect(first.spanContext().traceFlags).toBe(0)
  })
})
