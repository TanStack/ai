import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConsoleLogger } from '../../src/logger/console-logger'

describe('ConsoleLogger', () => {
  const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
  const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  const dirSpy = vi.spyOn(console, 'dir').mockImplementation(() => {})

  afterEach(() => {
    debugSpy.mockClear()
    infoSpy.mockClear()
    warnSpy.mockClear()
    errorSpy.mockClear()
    dirSpy.mockClear()
    vi.unstubAllGlobals()
  })

  it('routes debug to console.debug', () => {
    new ConsoleLogger().debug('hello')
    expect(debugSpy).toHaveBeenCalledWith('hello')
    expect(dirSpy).not.toHaveBeenCalled()
  })

  it('routes info to console.info', () => {
    new ConsoleLogger().info('hello')
    expect(infoSpy).toHaveBeenCalledWith('hello')
    expect(dirSpy).not.toHaveBeenCalled()
  })

  it('routes warn to console.warn', () => {
    new ConsoleLogger().warn('hello')
    expect(warnSpy).toHaveBeenCalledWith('hello')
    expect(dirSpy).not.toHaveBeenCalled()
  })

  it('routes error to console.error', () => {
    new ConsoleLogger().error('oops')
    expect(errorSpy).toHaveBeenCalledWith('oops')
    expect(dirSpy).not.toHaveBeenCalled()
  })

  it('prints meta via console.dir with depth: null on Node', () => {
    const meta = { key: 1 }
    new ConsoleLogger().debug('msg', meta)
    expect(debugSpy).toHaveBeenCalledWith('msg')
    expect(dirSpy).toHaveBeenCalledWith(meta, { depth: null, colors: true })
    // The message must precede the meta dump.
    expect(debugSpy.mock.invocationCallOrder[0]).toBeLessThan(
      dirSpy.mock.invocationCallOrder[0] ?? 0,
    )
  })

  it('omits console.dir when meta is not provided', () => {
    new ConsoleLogger().info('msg')
    expect(infoSpy).toHaveBeenCalledWith('msg')
    expect(infoSpy.mock.calls[0]?.length).toBe(1)
    expect(dirSpy).not.toHaveBeenCalled()
  })

  describe('on Cloudflare Workers (workerd)', () => {
    // workerd drops console.dir output entirely and shallow-truncates extra
    // console arguments, so meta is appended as pretty-printed JSON. With
    // nodejs_compat workerd also emulates process.versions.node — the
    // userAgent marker must win over the Node check.
    const stubWorkerd = () => {
      vi.stubGlobal('navigator', { userAgent: 'Cloudflare-Workers' })
      vi.stubGlobal('process', { versions: { node: '22.14.0' } })
    }

    it('appends meta as full-depth JSON instead of console.dir', () => {
      stubWorkerd()
      const meta = { a: { b: { c: { d: 'deep' } } } }
      new ConsoleLogger().debug('msg', meta)
      expect(dirSpy).not.toHaveBeenCalled()
      const logged = debugSpy.mock.calls[0]?.[0]
      expect(logged).toContain('msg\n')
      expect(logged).toContain('"d": "deep"')
    })

    it('does the same for info, warn, and error', () => {
      stubWorkerd()
      const meta = { key: 1 }
      const logger = new ConsoleLogger()
      logger.info('i', meta)
      logger.warn('w', meta)
      logger.error('e', meta)
      expect(infoSpy.mock.calls[0]?.[0]).toContain('"key": 1')
      expect(warnSpy.mock.calls[0]?.[0]).toContain('"key": 1')
      expect(errorSpy.mock.calls[0]?.[0]).toContain('"key": 1')
      expect(dirSpy).not.toHaveBeenCalled()
    })

    it('survives circular references in meta', () => {
      stubWorkerd()
      const meta: Record<string, unknown> = { name: 'loop' }
      meta.self = meta
      new ConsoleLogger().debug('msg', meta)
      const logged = debugSpy.mock.calls[0]?.[0]
      expect(logged).toContain('"self": "[Circular]"')
      expect(logged).toContain('"name": "loop"')
    })

    it('serializes Error instances with name, message, and stack', () => {
      stubWorkerd()
      new ConsoleLogger().error('boom', { error: new Error('upstream 401') })
      const logged = errorSpy.mock.calls[0]?.[0]
      expect(logged).toContain('"message": "upstream 401"')
      expect(logged).toContain('"name": "Error"')
    })

    it('serializes bigint values instead of throwing', () => {
      stubWorkerd()
      new ConsoleLogger().debug('msg', { tokens: 42n })
      expect(debugSpy.mock.calls[0]?.[0]).toContain('"tokens": "42"')
    })

    it('still logs message-only calls with a single plain argument', () => {
      stubWorkerd()
      new ConsoleLogger().debug('msg')
      expect(debugSpy).toHaveBeenCalledWith('msg')
      expect(debugSpy.mock.calls[0]?.length).toBe(1)
    })

    it('never throws, even for meta that defeats both JSON and String()', () => {
      stubWorkerd()
      const hostile = {
        toJSON() {
          throw new Error('no json')
        },
        [Symbol.toPrimitive]() {
          throw new Error('no string')
        },
      }
      expect(() => new ConsoleLogger().debug('msg', hostile)).not.toThrow()
      expect(debugSpy.mock.calls[0]?.[0]).toContain('[Unserializable meta]')
    })
  })

  describe('on non-Node runtimes without the workerd marker', () => {
    it('passes meta as a console argument when process.versions.node is absent', () => {
      vi.stubGlobal('process', {})
      const meta = { key: 1 }
      new ConsoleLogger().error('msg', meta)
      expect(errorSpy).toHaveBeenCalledWith('msg', meta)
      expect(dirSpy).not.toHaveBeenCalled()
    })
  })

  it('implements the Logger interface', () => {
    const logger: import('../../src/logger/types').Logger = new ConsoleLogger()
    expect(typeof logger.debug).toBe('function')
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.error).toBe('function')
  })
})
