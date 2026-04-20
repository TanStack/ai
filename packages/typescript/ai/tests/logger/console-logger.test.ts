import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConsoleLogger } from '../../src/logger/console-logger'

describe('ConsoleLogger', () => {
  const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
  const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
  const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

  afterEach(() => {
    debugSpy.mockClear()
    infoSpy.mockClear()
    warnSpy.mockClear()
    errorSpy.mockClear()
  })

  it('routes debug to console.debug', () => {
    new ConsoleLogger().debug('hello')
    expect(debugSpy).toHaveBeenCalledWith('hello')
  })

  it('routes info to console.info', () => {
    new ConsoleLogger().info('hello')
    expect(infoSpy).toHaveBeenCalledWith('hello')
  })

  it('routes warn to console.warn', () => {
    new ConsoleLogger().warn('hello')
    expect(warnSpy).toHaveBeenCalledWith('hello')
  })

  it('routes error to console.error', () => {
    new ConsoleLogger().error('oops')
    expect(errorSpy).toHaveBeenCalledWith('oops')
  })

  it('passes meta as second argument when provided', () => {
    new ConsoleLogger().debug('msg', { key: 1 })
    expect(debugSpy).toHaveBeenCalledTimes(1)
    const [message, formatted] = debugSpy.mock.calls[0] as [string, unknown]
    expect(message).toBe('msg')
    // On Node, meta is pretty-printed via util.inspect (string with depth: null).
    // In browsers, the object is passed through. Accept either.
    if (typeof formatted === 'string') {
      expect(formatted).toContain('key')
      expect(formatted).toContain('1')
    } else {
      expect(formatted).toEqual({ key: 1 })
    }
  })

  it('expands deeply nested meta on Node instead of truncating to [Object]', () => {
    const meta = { a: { b: { c: { d: { e: 'deep' } } } } }
    new ConsoleLogger().debug('msg', meta)
    const [, formatted] = debugSpy.mock.calls[0] as [string, unknown]
    if (typeof formatted === 'string') {
      // util.inspect with depth: null must show the deepest value.
      expect(formatted).toContain('deep')
      expect(formatted).not.toContain('[Object]')
    } else {
      expect(formatted).toEqual(meta)
    }
  })

  it('omits meta argument when not provided', () => {
    new ConsoleLogger().info('msg')
    expect(infoSpy).toHaveBeenCalledWith('msg')
    expect(infoSpy.mock.calls[0]?.length).toBe(1)
  })

  it('implements the Logger interface', () => {
    const logger: import('../../src/logger/types').Logger = new ConsoleLogger()
    expect(typeof logger.debug).toBe('function')
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.error).toBe('function')
  })
})
