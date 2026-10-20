import { describe, expectTypeOf, it } from 'vitest'
import type { Browser, BrowserContext, Page } from 'playwright-core'
import type {
  PlaywrightBrowserLike,
  PlaywrightContextLike,
  PlaywrightPageLike,
} from '../src/index'

describe('PlaywrightPageLike', () => {
  it('accepts a real playwright-core Page', () => {
    expectTypeOf<Page>().toExtend<PlaywrightPageLike>()
  })
})

describe('PlaywrightContextLike', () => {
  it('accepts a real playwright-core BrowserContext', () => {
    expectTypeOf<BrowserContext>().toExtend<PlaywrightContextLike>()
  })
})

describe('PlaywrightBrowserLike', () => {
  it('accepts a real playwright-core Browser', () => {
    expectTypeOf<Browser>().toExtend<PlaywrightBrowserLike>()
  })
})
