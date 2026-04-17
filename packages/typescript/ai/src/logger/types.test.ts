import { describe, expectTypeOf, it } from 'vitest'
import type { DebugCategories, DebugConfig, DebugOption, Logger } from './types'

describe('logger types', () => {
  it('Logger has debug/info/warn/error methods accepting (message, meta?)', () => {
    expectTypeOf<Logger['debug']>().parameters.toEqualTypeOf<[string, Record<string, unknown>?]>()
    expectTypeOf<Logger['info']>().parameters.toEqualTypeOf<[string, Record<string, unknown>?]>()
    expectTypeOf<Logger['warn']>().parameters.toEqualTypeOf<[string, Record<string, unknown>?]>()
    expectTypeOf<Logger['error']>().parameters.toEqualTypeOf<[string, Record<string, unknown>?]>()
  })

  it('DebugCategories has all eight optional boolean flags', () => {
    const cats: DebugCategories = {
      provider: true, output: true, middleware: true, tools: true,
      agentLoop: true, config: true, errors: true, request: true,
    }
    expectTypeOf(cats).toMatchTypeOf<DebugCategories>()
  })

  it('DebugConfig extends DebugCategories with optional logger', () => {
    const cfg: DebugConfig = { logger: { debug() {}, info() {}, warn() {}, error() {} } }
    expectTypeOf(cfg).toMatchTypeOf<DebugConfig>()
  })

  it('DebugOption is boolean | DebugConfig', () => {
    const a: DebugOption = true
    const b: DebugOption = false
    const c: DebugOption = { middleware: false }
    void a; void b; void c
  })
})
