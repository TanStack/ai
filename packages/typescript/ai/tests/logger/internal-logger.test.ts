import { describe, expect, it } from 'vitest'
import { InternalLogger } from '../../src/logger/internal-logger'
import type { Logger } from '../../src/logger/types'

type SpyCall = [keyof Logger, string, Record<string, unknown>?]

const makeSpyLogger = () => {
  const calls: Array<SpyCall> = []
  const logger: Logger = {
    debug: (m, meta) => {
      calls.push(['debug', m, meta])
    },
    info: (m, meta) => {
      calls.push(['info', m, meta])
    },
    warn: (m, meta) => {
      calls.push(['warn', m, meta])
    },
    error: (m, meta) => {
      calls.push(['error', m, meta])
    },
  }
  return { logger, calls }
}

const allOn = {
  provider: true,
  output: true,
  middleware: true,
  tools: true,
  agentLoop: true,
  config: true,
  errors: true,
  request: true,
}

const allOff = {
  provider: false,
  output: false,
  middleware: false,
  tools: false,
  agentLoop: false,
  config: false,
  errors: false,
  request: false,
}

describe('InternalLogger', () => {
  it('prepends emoji + [tanstack-ai:<category>] + emoji prefix on each category method', () => {
    const { logger, calls } = makeSpyLogger()
    const il = new InternalLogger(logger, allOn)
    il.provider('received', { type: 'text' })
    il.output('yielded')
    il.middleware('before')
    il.tools('called')
    il.agentLoop('iter 1')
    il.config('transform')
    il.errors('boom', { err: new Error('x') })
    il.request('started')
    expect(calls).toEqual([
      ['debug', '📥 [tanstack-ai:provider] 📥 received', { type: 'text' }],
      ['debug', '📨 [tanstack-ai:output] 📨 yielded', undefined],
      ['debug', '🧩 [tanstack-ai:middleware] 🧩 before', undefined],
      ['debug', '🔧 [tanstack-ai:tools] 🔧 called', undefined],
      ['debug', '🔁 [tanstack-ai:agentLoop] 🔁 iter 1', undefined],
      ['debug', '⚙️ [tanstack-ai:config] ⚙️ transform', undefined],
      ['error', '❌ [tanstack-ai:errors] ❌ boom', { err: expect.any(Error) }],
      ['debug', '📤 [tanstack-ai:request] 📤 started', undefined],
    ])
  })

  it('no-ops when category is disabled', () => {
    const { logger, calls } = makeSpyLogger()
    const il = new InternalLogger(logger, { ...allOn, middleware: false })
    il.middleware('x')
    il.provider('y')
    expect(calls).toEqual([
      ['debug', '📥 [tanstack-ai:provider] 📥 y', undefined],
    ])
  })

  it('all categories off produces zero calls', () => {
    const { logger, calls } = makeSpyLogger()
    const il = new InternalLogger(logger, allOff)
    il.provider('x')
    il.output('x')
    il.middleware('x')
    il.tools('x')
    il.agentLoop('x')
    il.config('x')
    il.errors('x')
    il.request('x')
    expect(calls).toEqual([])
  })

  it('errors uses logger.error; everything else uses logger.debug', () => {
    const { logger, calls } = makeSpyLogger()
    const il = new InternalLogger(logger, allOn)
    il.errors('e')
    il.provider('p')
    expect(calls[0]?.[0]).toBe('error')
    expect(calls[1]?.[0]).toBe('debug')
  })

  it('exposes isEnabled(category) helper for hot-path guards', () => {
    const { logger } = makeSpyLogger()
    const il = new InternalLogger(logger, { ...allOn, provider: false })
    expect(il.isEnabled('provider')).toBe(false)
    expect(il.isEnabled('output')).toBe(true)
  })

  it('swallows errors thrown by the user-supplied logger', () => {
    // User logger that throws on every method. Without a try/catch around
    // the delegated call, this would mask the real error that triggered the
    // log (e.g. a provider SDK failure inside the chat stream).
    const throwingLogger: Logger = {
      debug: () => {
        throw new Error('user logger debug exploded')
      },
      info: () => {
        throw new Error('user logger info exploded')
      },
      warn: () => {
        throw new Error('user logger warn exploded')
      },
      error: () => {
        throw new Error('user logger error exploded')
      },
    }
    const il = new InternalLogger(throwingLogger, allOn)
    expect(() => il.provider('p')).not.toThrow()
    expect(() => il.errors('e')).not.toThrow()
  })
})
