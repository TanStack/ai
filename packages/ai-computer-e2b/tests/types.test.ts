import { describe, expectTypeOf, it } from 'vitest'
import type { Sandbox } from '@e2b/desktop'
import type { E2BDesktopLike } from '../src/index'

describe('E2BDesktopLike', () => {
  it('accepts a real @e2b/desktop Sandbox', () => {
    expectTypeOf<Sandbox>().toExtend<E2BDesktopLike>()
  })
})
