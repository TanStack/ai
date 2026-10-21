import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createPlaywrightComputerDriver,
  playwrightComputer,
} from '../src/index'
import type { LaunchOptions } from 'playwright-core'
import type { PlaywrightBrowserLike, PlaywrightPageLike } from '../src/index'

const launch = vi.hoisted(() =>
  vi.fn<(options?: LaunchOptions) => Promise<PlaywrightBrowserLike>>(),
)

vi.mock('playwright-core', () => ({ chromium: { launch } }))

const PNG = new Uint8Array([137, 80, 78, 71])

function createFakePage(
  viewport: { width: number; height: number } | null = {
    width: 1280,
    height: 720,
  },
) {
  const calls: Array<[string, ...Array<unknown>]> = []
  const record =
    (name: string) =>
    async (...args: Array<unknown>) => {
      calls.push([name, ...args])
    }
  const page: PlaywrightPageLike = {
    viewportSize: () => viewport,
    screenshot: async (options) => {
      calls.push(['screenshot', options])
      return PNG
    },
    mouse: {
      move: record('mouse.move'),
      down: record('mouse.down'),
      up: record('mouse.up'),
      click: record('mouse.click'),
      wheel: record('mouse.wheel'),
    },
    keyboard: {
      down: record('keyboard.down'),
      up: record('keyboard.up'),
      press: record('keyboard.press'),
      type: record('keyboard.type'),
    },
    goBack: record('goBack'),
    goForward: record('goForward'),
    goto: record('goto'),
  }
  return { page, calls }
}

function setup() {
  const { page, calls } = createFakePage()
  return { driver: createPlaywrightComputerDriver({ page }), calls }
}

function createFakeBrowser({
  gotoError,
  closeError,
}: { gotoError?: Error; closeError?: Error } = {}) {
  const contexts: Array<{
    viewport: { width: number; height: number }
    calls: Array<[string, ...Array<unknown>]>
    closed: boolean
  }> = []
  const state = { closed: false }
  const browser: PlaywrightBrowserLike = {
    newContext: async ({ viewport }) => {
      const { page, calls } = createFakePage(viewport)
      if (gotoError) {
        page.goto = async () => {
          throw gotoError
        }
      }
      const context = { viewport, calls, closed: false }
      contexts.push(context)
      return {
        newPage: async () => page,
        close: async () => {
          context.closed = true
          if (closeError) throw closeError
        },
      }
    },
    close: async () => {
      state.closed = true
    },
  }
  return { browser, contexts, state }
}

describe('createPlaywrightComputerDriver', () => {
  it('reads display from the viewport and reports a browser', () => {
    const { driver } = setup()
    expect(driver.display).toEqual({ width: 1280, height: 720 })
    expect(driver.environment).toBe('browser')
  })

  it('throws at create when the page has no viewport', () => {
    const { page } = createFakePage(null)
    expect(() => createPlaywrightComputerDriver({ page })).toThrow(
      'The page has no viewport size. Set a viewport on the browser context.',
    )
  })

  it('takes a PNG screenshot', async () => {
    const { driver, calls } = setup()
    expect(await driver.screenshot()).toEqual(PNG)
    expect(calls).toEqual([['screenshot', { type: 'png' }]])
  })

  it('zooms with a clipped screenshot', async () => {
    const { driver, calls } = setup()
    const region = { x: 10, y: 20, width: 100, height: 50 }
    expect(await driver.zoom?.(region)).toEqual(PNG)
    expect(calls).toEqual([['screenshot', { type: 'png', clip: region }]])
  })

  it('clicks with the button and the click count', async () => {
    const { driver, calls } = setup()
    await driver.click(5, 6, { button: 'right', count: 2 })
    expect(calls).toEqual([
      ['mouse.click', 5, 6, { button: 'right', clickCount: 2 }],
    ])
  })

  it('navigates back and forward on a click', async () => {
    const { driver, calls } = setup()
    await driver.click(1, 1, { button: 'back', count: 1 })
    await driver.click(1, 1, { button: 'forward', count: 1 })
    expect(calls).toEqual([['goBack'], ['goForward']])
  })

  it('moves, presses, and releases the mouse', async () => {
    const { driver, calls } = setup()
    await driver.move(3, 4)
    await driver.mouseDown('left')
    await driver.mouseUp('middle')
    expect(calls).toEqual([
      ['mouse.move', 3, 4],
      ['mouse.down', { button: 'left' }],
      ['mouse.up', { button: 'middle' }],
    ])
  })

  it('navigates once for a back press and release', async () => {
    const { driver, calls } = setup()
    await driver.mouseDown('back')
    await driver.mouseUp('back')
    expect(calls).toEqual([['goBack']])
  })

  it('moves to the point and then scrolls', async () => {
    const { driver, calls } = setup()
    await driver.scroll(50, 60, 0, 300)
    expect(calls).toEqual([
      ['mouse.move', 50, 60],
      ['mouse.wheel', 0, 300],
    ])
  })

  it('sends keys and text to the keyboard', async () => {
    const { driver, calls } = setup()
    await driver.keyDown('Shift')
    await driver.keyUp('Shift')
    await driver.press(['Control', 's'])
    await driver.type('hello')
    expect(calls).toEqual([
      ['keyboard.down', 'Shift'],
      ['keyboard.up', 'Shift'],
      ['keyboard.press', 'Control+s'],
      ['keyboard.type', 'hello'],
    ])
  })

  it('goes to a URL', async () => {
    const { driver, calls } = setup()
    await driver.navigate?.('https://tanstack.com')
    expect(calls).toEqual([['goto', 'https://tanstack.com']])
  })
})

describe('playwrightComputer', () => {
  beforeEach(() => {
    launch.mockReset()
  })

  it('reports a browser with zoom and navigate', async () => {
    const { browser } = createFakeBrowser()
    const factory = playwrightComputer({ browser })
    const driver = await factory.create({ threadId: 'a' })
    expect(factory.environment).toBe('browser')
    expect(factory.capabilities).toEqual({
      zoom: true,
      cursorPosition: false,
      navigate: true,
    })
    expect(driver.zoom).toBeTypeOf('function')
    expect(driver.navigate).toBeTypeOf('function')
    expect(driver.cursorPosition).toBeUndefined()
  })

  it('makes one 1280x800 context for each thread by default', async () => {
    const { browser, contexts } = createFakeBrowser()
    const factory = playwrightComputer({ browser })
    const driver = await factory.create({ threadId: 'a' })
    await factory.create({ threadId: 'b' })
    expect(factory.display).toEqual({ width: 1280, height: 800 })
    expect(driver.display).toEqual({ width: 1280, height: 800 })
    expect(contexts.map((context) => context.viewport)).toEqual([
      { width: 1280, height: 800 },
      { width: 1280, height: 800 },
    ])
  })

  it('uses the display option as the viewport', async () => {
    const { browser, contexts } = createFakeBrowser()
    const display = { width: 1024, height: 768 }
    const factory = playwrightComputer({ browser, display })
    const driver = await factory.create({ threadId: 'a' })
    expect(factory.display).toEqual({ width: 1024, height: 768 })
    expect(driver.display).toEqual({ width: 1024, height: 768 })
    expect(contexts[0]?.viewport).toEqual({ width: 1024, height: 768 })
  })

  it('opens startUrl on the new page', async () => {
    const { browser, contexts } = createFakeBrowser()
    const factory = playwrightComputer({
      browser,
      startUrl: 'https://tanstack.com',
    })
    await factory.create({ threadId: 'a' })
    expect(contexts[0]?.calls).toEqual([['goto', 'https://tanstack.com']])
  })

  it('does not navigate without startUrl', async () => {
    const { browser, contexts } = createFakeBrowser()
    await playwrightComputer({ browser }).create({ threadId: 'a' })
    expect(contexts[0]?.calls).toEqual([])
  })

  it('keeps the startUrl error when closing the context throws', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { browser, contexts } = createFakeBrowser({
      gotoError: new Error('net::ERR_NAME_NOT_RESOLVED'),
      closeError: new Error('close failed'),
    })
    const factory = playwrightComputer({
      browser,
      startUrl: 'https://tanstack.invalid',
    })
    await expect(factory.create({ threadId: 'a' })).rejects.toThrow(
      'net::ERR_NAME_NOT_RESOLVED',
    )
    expect(contexts[0]?.closed).toBe(true)
    expect(error).toHaveBeenCalledWith(
      'Failed to close the Playwright context after setup failed.',
      expect.any(Error),
    )
    error.mockRestore()
  })

  it('closes the context and rethrows when startUrl fails to load', async () => {
    const { browser, contexts } = createFakeBrowser({
      gotoError: new Error('net::ERR_NAME_NOT_RESOLVED'),
    })
    const factory = playwrightComputer({
      browser,
      startUrl: 'https://tanstack.invalid',
    })
    await expect(factory.create({ threadId: 'a' })).rejects.toThrow(
      'net::ERR_NAME_NOT_RESOLVED',
    )
    expect(contexts[0]?.closed).toBe(true)
  })

  it('closes only its own context when a driver closes', async () => {
    const { browser, contexts, state } = createFakeBrowser()
    const factory = playwrightComputer({ browser })
    const first = await factory.create({ threadId: 'a' })
    await factory.create({ threadId: 'b' })
    await first.close?.()
    expect(contexts.map((context) => context.closed)).toEqual([true, false])
    expect(state.closed).toBe(false)
  })

  it('leaves a passed browser open on factory close', async () => {
    const { browser, state } = createFakeBrowser()
    const factory = playwrightComputer({ browser })
    await factory.create({ threadId: 'a' })
    await factory.close?.()
    expect(state.closed).toBe(false)
  })

  it('launches Chromium once for two threads at once', async () => {
    const { browser, contexts } = createFakeBrowser()
    launch.mockResolvedValue(browser)
    const factory = playwrightComputer({ launch: { headless: false } })
    await Promise.all([
      factory.create({ threadId: 'a' }),
      factory.create({ threadId: 'b' }),
    ])
    expect(launch.mock.calls).toEqual([[{ headless: false }]])
    expect(contexts).toHaveLength(2)
  })

  it('closes the launched browser on factory close', async () => {
    const { browser, state } = createFakeBrowser()
    launch.mockResolvedValue(browser)
    const factory = playwrightComputer()
    await factory.create({ threadId: 'a' })
    await factory.close?.()
    expect(state.closed).toBe(true)
  })

  it('tries the launch again after a failed launch', async () => {
    const { browser, contexts } = createFakeBrowser()
    launch
      .mockRejectedValueOnce(new Error('Chromium is not installed'))
      .mockResolvedValueOnce(browser)
    const factory = playwrightComputer()
    await expect(factory.create({ threadId: 'a' })).rejects.toThrow(
      'Chromium is not installed',
    )
    await factory.create({ threadId: 'a' })
    expect(launch).toHaveBeenCalledTimes(2)
    expect(contexts).toHaveLength(1)
  })
})
