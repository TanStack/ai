import { describe, expectTypeOf, it } from 'vitest'
import type {
  DebugCategories,
  DebugConfig,
  DebugOption,
  Logger,
} from '../../src/logger/types'

describe('logger types', () => {
  it('Logger has debug/info/warn/error methods accepting (message, meta?)', () => {
    expectTypeOf<Logger['debug']>().parameters.toEqualTypeOf<
      [string, Record<string, unknown>?]
    >()
    expectTypeOf<Logger['info']>().parameters.toEqualTypeOf<
      [string, Record<string, unknown>?]
    >()
    expectTypeOf<Logger['warn']>().parameters.toEqualTypeOf<
      [string, Record<string, unknown>?]
    >()
    expectTypeOf<Logger['error']>().parameters.toEqualTypeOf<
      [string, Record<string, unknown>?]
    >()
  })

  it('Logger methods all return void', () => {
    expectTypeOf<Logger['debug']>().returns.toEqualTypeOf<void>()
    expectTypeOf<Logger['info']>().returns.toEqualTypeOf<void>()
    expectTypeOf<Logger['warn']>().returns.toEqualTypeOf<void>()
    expectTypeOf<Logger['error']>().returns.toEqualTypeOf<void>()
  })

  it('DebugCategories has all eight optional boolean flags and allows empty object', () => {
    expectTypeOf<DebugCategories>().toEqualTypeOf<{
      provider?: boolean
      output?: boolean
      middleware?: boolean
      tools?: boolean
      agentLoop?: boolean
      config?: boolean
      errors?: boolean
      request?: boolean
    }>()
    const empty: DebugCategories = {}
    void empty
  })

  it('DebugConfig extends DebugCategories and adds optional logger; empty object is valid', () => {
    expectTypeOf<DebugConfig>().toMatchTypeOf<DebugCategories>()
    const withLogger: DebugConfig = {
      logger: { debug() {}, info() {}, warn() {}, error() {} },
    }
    const empty: DebugConfig = {}
    void withLogger
    void empty
  })

  it('DebugOption equals boolean | DebugConfig', () => {
    expectTypeOf<DebugOption>().toEqualTypeOf<boolean | DebugConfig>()
    const a: DebugOption = true
    const b: DebugOption = false
    const c: DebugOption = { middleware: false }
    void a
    void b
    void c
  })
})
