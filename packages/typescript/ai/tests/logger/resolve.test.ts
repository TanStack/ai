import { describe, expect, it, vi } from 'vitest'
import { ConsoleLogger } from '../../src/logger/console-logger'
import { InternalLogger } from '../../src/logger/internal-logger'
import { resolveDebugOption } from '../../src/logger/resolve'
import type { Logger } from '../../src/logger/types'

const makeCustomLogger = (): Logger => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
})

const ALL_CATEGORIES = [
  'provider',
  'output',
  'middleware',
  'tools',
  'agentLoop',
  'config',
  'errors',
  'request',
] as const

describe('resolveDebugOption', () => {
  it('returns an InternalLogger for every input shape', () => {
    expect(resolveDebugOption(undefined)).toBeInstanceOf(InternalLogger)
    expect(resolveDebugOption(true)).toBeInstanceOf(InternalLogger)
    expect(resolveDebugOption(false)).toBeInstanceOf(InternalLogger)
    expect(resolveDebugOption({})).toBeInstanceOf(InternalLogger)
    expect(resolveDebugOption({ logger: makeCustomLogger() })).toBeInstanceOf(
      InternalLogger,
    )
  })

  it('undefined → errors=true, others=false', () => {
    const il = resolveDebugOption(undefined)
    expect(il.isEnabled('errors')).toBe(true)
    for (const cat of ALL_CATEGORIES.filter((c) => c !== 'errors')) {
      expect(il.isEnabled(cat)).toBe(false)
    }
  })

  it('true → all categories on', () => {
    const il = resolveDebugOption(true)
    for (const cat of ALL_CATEGORIES) expect(il.isEnabled(cat)).toBe(true)
  })

  it('false → all categories off (incl. errors)', () => {
    const il = resolveDebugOption(false)
    for (const cat of ALL_CATEGORIES) expect(il.isEnabled(cat)).toBe(false)
  })

  it('empty object → all categories on with default ConsoleLogger', () => {
    const il = resolveDebugOption({})
    for (const cat of ALL_CATEGORIES) expect(il.isEnabled(cat)).toBe(true)
  })

  it('partial object: unspecified categories default to true, explicit false is respected', () => {
    const il = resolveDebugOption({ middleware: false })
    expect(il.isEnabled('middleware')).toBe(false)
    expect(il.isEnabled('provider')).toBe(true)
    expect(il.isEnabled('output')).toBe(true)
    expect(il.isEnabled('errors')).toBe(true)
  })

  it('explicit errors=false is respected', () => {
    const il = resolveDebugOption({ errors: false })
    expect(il.isEnabled('errors')).toBe(false)
    expect(il.isEnabled('provider')).toBe(true)
  })

  it('{ logger } → uses supplied logger and all categories on', () => {
    const custom = makeCustomLogger()
    const il = resolveDebugOption({ logger: custom })
    il.provider('x')
    expect(custom.debug).toHaveBeenCalledWith(
      '📥 [tanstack-ai:provider] 📥 x',
      undefined,
    )
    for (const cat of ALL_CATEGORIES) expect(il.isEnabled(cat)).toBe(true)
  })

  it('{ logger, tools: false } → custom logger, tools off, others on', () => {
    const custom = makeCustomLogger()
    const il = resolveDebugOption({ logger: custom, tools: false })
    expect(il.isEnabled('tools')).toBe(false)
    expect(il.isEnabled('provider')).toBe(true)
    il.provider('p')
    expect(custom.debug).toHaveBeenCalledWith(
      '📥 [tanstack-ai:provider] 📥 p',
      undefined,
    )
  })

  it('default instance routes through a ConsoleLogger', () => {
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    resolveDebugOption(true).provider('hi')
    expect(spy).toHaveBeenCalledWith('📥 [tanstack-ai:provider] 📥 hi')
    spy.mockRestore()
  })
})

// Keep ConsoleLogger import used: ensure the default is indeed a ConsoleLogger
// (covered indirectly by the last test).
void ConsoleLogger
