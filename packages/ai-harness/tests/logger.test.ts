import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventType, defineAgent } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
} from '../src'
import { safeLogger } from '../src/logger'
import { mockAdapter, text } from './helpers'
import type { AnyTextAdapter, Logger, StreamChunk } from '@tanstack/ai'
import type { HarnessPlugin } from '../src'
import type { Reply } from './helpers'

/** A logger that records each call. */
const recordingLogger = () => ({
  debug: vi.fn<Logger['debug']>(),
  info: vi.fn<Logger['info']>(),
  warn: vi.fn<Logger['warn']>(),
  error: vi.fn<Logger['error']>(),
})

/** A model call that starts, then fails with `failure`. */
const failsWith =
  (failure: Error): Reply =>
  () =>
    (async function* (): AsyncGenerator<StreamChunk> {
      yield {
        type: EventType.RUN_STARTED,
        runId: 'r',
        threadId: 't',
        timestamp: Date.now(),
      }
      throw failure
    })()

/**
 * Open thread `t1` on a host that logs to `logger`. The host gets memory
 * stores: only the first host with no stores in this file warns, and the
 * warning test makes that host.
 */
async function open(
  logger: Logger,
  adapter: AnyTextAdapter,
  plugins: Array<HarnessPlugin> = [],
) {
  const host = createHarnessHost({ persistence: memoryPersistence(), logger })
  const session = await host.open(
    defineHarness({ name: 'test/logger', adapter, plugins: () => plugins }),
    { threadId: 't1' },
  )
  return { host, session }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the host logger', () => {
  it('gets the warnings of the host, and the console gets none', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const logger = recordingLogger()

    // The only host of this file without persistence: it warns once.
    const host = createHarnessHost({ logger })

    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('No persistence given'),
    )
    expect(consoleWarn).not.toHaveBeenCalled()
    await host.close()
  })

  it('opens a session and runs a turn when every method of the logger throws', async () => {
    const throws = () => {
      throw new Error('The logger is down.')
    }
    const { host, session } = await open(
      { debug: throws, info: throws, warn: throws, error: throws },
      mockAdapter(() => text('Hello back.')).adapter,
    )
    // The session logs each throw of this listener.
    session.onEvent(() => {
      throw new Error('The listener failed.')
    })

    await expect(session.send('Hi')).resolves.toMatchObject({
      text: 'Hello back.',
    })
    await host.close()
  })

  it('is ctx.logger of each plugin', async () => {
    const logger = recordingLogger()
    const plugin = definePlugin({
      name: 'test/index',
      setup: (ctx) => {
        ctx.logger.warn('The index is stale.', { files: 2 })
      },
    })

    const { host } = await open(logger, mockAdapter([]).adapter, [plugin])

    expect(logger.warn).toHaveBeenCalledWith('The index is stale.', {
      files: 2,
    })
    await host.close()
  })

  it('is ctx.logger of the shared setup of a host plugin', async () => {
    const logger = recordingLogger()
    const plugin = definePlugin({
      name: 'test/pool',
      lifetime: 'host',
      setup: (ctx) => {
        ctx.logger.warn('The pool is slow.', { size: 4 })
      },
    })

    const { host } = await open(logger, mockAdapter([]).adapter, [plugin])

    expect(logger.warn).toHaveBeenCalledWith('The pool is slow.', { size: 4 })
    await host.close()
  })

  it('gets the error of a model call of a turn, and no debug lines', async () => {
    const logger = recordingLogger()
    const failure = new Error('model down')
    const { host, session } = await open(
      logger,
      mockAdapter(failsWith(failure)).adapter,
    )

    await expect(session.send('Hi')).rejects.toThrow('model down')

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('chat run failed'),
      expect.objectContaining({ error: failure }),
    )
    expect(logger.debug).not.toHaveBeenCalled()
    await host.close()
  })

  it('gets the error of a ctx.model.chat call', async () => {
    const logger = recordingLogger()
    const failure = new Error('judge down')
    const judge = mockAdapter(failsWith(failure))
    const plugin = definePlugin({
      name: 'test/judge',
      setup: (ctx) => ({
        commands: {
          judge: defineCommand({
            description: 'Judge',
            run: (_input, { run }) =>
              ctx.model
                .chat({
                  adapter: judge.adapter,
                  run,
                  options: { messages: [{ role: 'user', content: 'Judge' }] },
                })
                .then(
                  () => 'no error',
                  (error: unknown) => String(error),
                ),
          }),
        },
      }),
    })
    const { host, session } = await open(logger, mockAdapter([]).adapter, [
      plugin,
    ])

    expect(await session.runCommand({ name: 'judge' })).toBe(
      'Error: judge down',
    )
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('chat run failed'),
      expect.objectContaining({ error: failure }),
    )
    await host.close()
  })

  it('gets the error of a model call of a child agent, and the console gets none', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const logger = recordingLogger()
    const failure = new Error('writer down')
    const writer = mockAdapter(failsWith(failure))
    const plugin = definePlugin({
      name: 'test/writer',
      setup: () => ({
        agents: [
          defineAgent({
            name: 'writer',
            description: 'Writes',
            run: (ctx) => ctx.chat({ adapter: writer.adapter }),
          }),
        ],
      }),
    })
    const { host, session } = await open(logger, mockAdapter([]).adapter, [
      plugin,
    ])

    await expect(session.agent('writer')?.start()).rejects.toThrow(
      'writer down',
    )

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('chat run failed'),
      expect.objectContaining({ error: failure }),
    )
    expect(consoleError).not.toHaveBeenCalled()
    await host.close()
  })
})

describe('safeLogger', () => {
  it('drops a promise of the logger that rejects', async () => {
    const seen: Array<string> = []
    // Not a vi.fn: a spy handles the promises that it returns.
    const rejects = (message: string) => {
      seen.push(message)
      return Promise.reject(new Error('The log is down.'))
    }
    const logger = safeLogger({
      debug: rejects,
      info: rejects,
      warn: rejects,
      error: rejects,
    })

    logger.error('A step failed.')
    // An unhandled rejection fails the run after this wait.
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(seen).toEqual(['A step failed.'])
  })
})
