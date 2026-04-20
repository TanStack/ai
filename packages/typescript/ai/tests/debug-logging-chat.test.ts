import { describe, expect, it, vi } from 'vitest'
import { chat } from '../src/activities/chat/index'
import type { Logger } from '../src/logger/types'
import type { StreamChunk } from '../src/types'
import { collectChunks, createMockAdapter, ev } from './test-utils'

// ============================================================================
// Helpers
// ============================================================================

const makeSpyLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
})

/**
 * Create a mock adapter whose chatStream throws once iteration begins.
 * Exercises the error path through the chat pipeline.
 */
function createFailingMockAdapter(
  message = 'mock adapter failure',
): ReturnType<typeof createMockAdapter> {
  return createMockAdapter({
    chatStreamFn: () =>
      (async function* (): AsyncIterable<StreamChunk> {
        throw new Error(message)
      })(),
  })
}

const logPrefixes = (
  calls: ReadonlyArray<ReadonlyArray<unknown>>,
): Array<string> =>
  calls.map((call) => {
    const m = call[0]
    return typeof m === 'string' ? m : String(m)
  })

// ============================================================================
// Tests
// ============================================================================

describe('debug logging — chat integration', () => {
  it('debug: true emits logs across request, agentLoop, output, and more', async () => {
    const logger = makeSpyLogger()
    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.textStart(),
          ev.textContent('hi'),
          ev.textEnd(),
          ev.runFinished('stop'),
        ],
      ],
    })

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'hello' }],
      debug: { logger: logger as unknown as Logger },
    })
    await collectChunks(stream as AsyncIterable<StreamChunk>)

    const debugMsgs = logPrefixes(logger.debug.mock.calls)
    expect(debugMsgs.some((m) => m.includes('[tanstack-ai:request]'))).toBe(
      true,
    )
    expect(debugMsgs.some((m) => m.includes('[tanstack-ai:output]'))).toBe(true)
    expect(debugMsgs.some((m) => m.includes('[tanstack-ai:agentLoop]'))).toBe(
      true,
    )
  })

  it('debug: { middleware: false } silences middleware logs only', async () => {
    const logger = makeSpyLogger()
    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.textStart(),
          ev.textContent('hi'),
          ev.textEnd(),
          ev.runFinished('stop'),
        ],
      ],
    })

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'hello' }],
      middleware: [
        {
          name: 'passthrough',
          onChunk: (_ctx, c) => c,
        },
      ],
      debug: { logger: logger as unknown as Logger, middleware: false },
    })
    await collectChunks(stream as AsyncIterable<StreamChunk>)

    const debugMsgs = logPrefixes(logger.debug.mock.calls)
    expect(debugMsgs.some((m) => m.includes('[tanstack-ai:middleware]'))).toBe(
      false,
    )
    expect(debugMsgs.some((m) => m.includes('[tanstack-ai:output]'))).toBe(true)
  })

  it('granular flags: middleware logs fire when middleware: true', async () => {
    const logger = makeSpyLogger()
    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.textStart(),
          ev.textContent('hi'),
          ev.textEnd(),
          ev.runFinished('stop'),
        ],
      ],
    })

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'hello' }],
      middleware: [
        {
          name: 'passthrough',
          onChunk: (_ctx, c) => c,
        },
      ],
      debug: { logger: logger as unknown as Logger },
    })
    await collectChunks(stream as AsyncIterable<StreamChunk>)

    const debugMsgs = logPrefixes(logger.debug.mock.calls)
    expect(debugMsgs.some((m) => m.includes('[tanstack-ai:middleware]'))).toBe(
      true,
    )
  })

  it('debug: false produces zero logs, even when adapter throws', async () => {
    const logger = makeSpyLogger()
    const { adapter } = createFailingMockAdapter()

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'hello' }],
      debug: {
        logger: logger as unknown as Logger,
        errors: false,
        provider: false,
        output: false,
        middleware: false,
        tools: false,
        agentLoop: false,
        config: false,
        request: false,
      },
    })
    try {
      await collectChunks(stream as AsyncIterable<StreamChunk>)
    } catch {
      // expected — adapter throws
    }

    expect(logger.debug).not.toHaveBeenCalled()
    expect(logger.error).not.toHaveBeenCalled()
    expect(logger.info).not.toHaveBeenCalled()
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it('omitted debug — errors still log via default ConsoleLogger', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const { adapter } = createFailingMockAdapter()

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'hello' }],
    })
    try {
      await collectChunks(stream as AsyncIterable<StreamChunk>)
    } catch {
      // expected — adapter throws
    }

    const msgs = logPrefixes(errSpy.mock.calls)
    expect(msgs.some((m) => m.includes('[tanstack-ai:errors]'))).toBe(true)

    // No debug-level category should have leaked when `debug` is unspecified.
    const debugMsgs = logPrefixes(debugSpy.mock.calls)
    expect(debugMsgs.some((m) => m.includes('[tanstack-ai:'))).toBe(false)

    errSpy.mockRestore()
    debugSpy.mockRestore()
  })

  it('custom logger receives calls with meta', async () => {
    const logger = makeSpyLogger()
    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.textStart(),
          ev.textContent('hi'),
          ev.textEnd(),
          ev.runFinished('stop'),
        ],
      ],
    })

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'hello' }],
      debug: { logger: logger as unknown as Logger },
    })
    await collectChunks(stream as AsyncIterable<StreamChunk>)

    expect(logger.debug).toHaveBeenCalled()
    for (const [, meta] of logger.debug.mock.calls) {
      if (meta !== undefined) {
        expect(typeof meta).toBe('object')
        expect(meta).not.toBeNull()
      }
    }
  })

  // Task 43 — error paths route to the errors category.
  it('adapter throws — custom logger receives error call tagged [tanstack-ai:errors]', async () => {
    const logger = makeSpyLogger()
    const { adapter } = createFailingMockAdapter('boom')

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'hello' }],
      debug: { logger: logger as unknown as Logger },
    })
    try {
      await collectChunks(stream as AsyncIterable<StreamChunk>)
    } catch {
      // expected — adapter throws
    }

    expect(logger.error).toHaveBeenCalled()
    const prefixes = logPrefixes(logger.error.mock.calls)
    expect(prefixes.some((m) => m.includes('[tanstack-ai:errors]'))).toBe(true)
  })

  it('debug: true with failing adapter still routes error to errors category', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    const { adapter } = createFailingMockAdapter('boom-default')

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'hello' }],
      debug: true,
    })
    try {
      await collectChunks(stream as AsyncIterable<StreamChunk>)
    } catch {
      // expected — adapter throws
    }

    const errMsgs = logPrefixes(errSpy.mock.calls)
    expect(errMsgs.some((m) => m.includes('[tanstack-ai:errors]'))).toBe(true)

    errSpy.mockRestore()
    debugSpy.mockRestore()
  })
})
