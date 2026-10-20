import { describe, expectTypeOf, it } from 'vitest'
import type { Page } from 'playwright-core'
import type { PlaywrightPageLike } from '../src/index'

describe('PlaywrightPageLike', () => {
  it('accepts a real playwright-core Page', () => {
    expectTypeOf<Page>().toExtend<PlaywrightPageLike>()
  })
})
