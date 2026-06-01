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

  it('prints meta via console.dir with depth: null when provided', () => {
    const meta = { key: 1 }
    new ConsoleLogger().debug('msg', meta)
    expect(debugSpy).toHaveBeenCalledWith('msg')
    expect(dirSpy).toHaveBeenCalledWith(meta, { depth: null, colors: true })
  })

  it('omits console.dir when meta is not provided', () => {
    new ConsoleLogger().info('msg')
    expect(infoSpy).toHaveBeenCalledWith('msg')
    expect(infoSpy.mock.calls[0]?.length).toBe(1)
    expect(dirSpy).not.toHaveBeenCalled()
  })

  it('implements the Logger interface', () => {
    const logger: import('../../src/logger/types').Logger = new ConsoleLogger()
    expect(typeof logger.debug).toBe('function')
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.error).toBe('function')
  })
})
