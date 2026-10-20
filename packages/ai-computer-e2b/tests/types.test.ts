import { describe, expectTypeOf, it } from 'vitest'
import type { Sandbox } from '@e2b/desktop'
import type { E2BComputerOptions, E2BDesktopLike } from '../src/index'

describe('E2BDesktopLike', () => {
  it('accepts a real @e2b/desktop Sandbox', () => {
    expectTypeOf<Sandbox>().toExtend<E2BDesktopLike>()
  })
})

describe('E2BComputerOptions', () => {
  it('accepts the sandbox options and a display', () => {
    expectTypeOf<
      Pick<E2BComputerOptions, 'apiKey' | 'timeoutMs' | 'display'>
    >().toEqualTypeOf<{
      apiKey?: string
      timeoutMs?: number
      display?: { width: number; height: number }
    }>()
  })

  it('has no resolution, because display sets it', () => {
    expectTypeOf<E2BComputerOptions>().not.toHaveProperty('resolution')
  })
})
