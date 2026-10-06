import { describe, expectTypeOf, it } from 'vitest'
import type { Sandbox } from 'e2b'
import type { E2BSandboxLike } from '../src/index'

describe('E2BSandboxLike', () => {
  it('accepts a real e2b Sandbox', () => {
    expectTypeOf<Sandbox>().toExtend<E2BSandboxLike>()
  })
})
