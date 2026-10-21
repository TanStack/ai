import type {
  ComputerDriver,
  ComputerDriverFactory,
  MouseButton,
} from '@tanstack/ai-computer-use'
import type { LaunchOptions } from 'playwright-core'

type PageMouseButton = 'left' | 'right' | 'middle'

/** The slice of a Playwright `Page` the driver uses. */
export interface PlaywrightPageLike {
  viewportSize: () => { width: number; height: number } | null
  screenshot: (options: {
    type: 'png'
    clip?: { x: number; y: number; width: number; height: number }
  }) => Promise<Uint8Array>
  mouse: {
    move: (x: number, y: number) => Promise<void>
    down: (options: { button: PageMouseButton }) => Promise<void>
    up: (options: { button: PageMouseButton }) => Promise<void>
    click: (
      x: number,
      y: number,
      options: { button: PageMouseButton; clickCount: number },
    ) => Promise<void>
    wheel: (deltaX: number, deltaY: number) => Promise<void>
  }
  keyboard: {
    down: (key: string) => Promise<void>
    up: (key: string) => Promise<void>
    press: (key: string) => Promise<void>
    type: (text: string) => Promise<void>
  }
  goBack: () => Promise<unknown>
  goForward: () => Promise<unknown>
  goto: (url: string) => Promise<unknown>
}

/** The slice of a Playwright `BrowserContext` the factory uses. */
export interface PlaywrightContextLike {
  newPage: () => Promise<PlaywrightPageLike>
  close: () => Promise<void>
}

/** The slice of a Playwright `Browser` the factory uses. */
export interface PlaywrightBrowserLike {
  newContext: (options: {
    viewport: { width: number; height: number }
  }) => Promise<PlaywrightContextLike>
  close: () => Promise<void>
}

export interface PlaywrightComputerDriverOptions {
  /** The page to control. It must have a viewport size. */
  page: PlaywrightPageLike
}

export interface PlaywrightComputerOptions {
  /** The URL that each new page opens. Without it, the page stays blank. */
  startUrl?: string
  /** The viewport of each page in pixels. The default is 1280 x 800. */
  display?: { width: number; height: number }
  /**
   * The browser that makes the pages. Without it, the factory launches
   * Chromium on the first thread. A browser you pass in stays open.
   */
  browser?: PlaywrightBrowserLike
  /** The options for `chromium.launch`. With `browser`, the factory ignores them. */
  launch?: LaunchOptions
}

/**
 * Create a computer driver that controls one Playwright page.
 *
 * The driver reads the viewport size once, at create. Key names go to
 * Playwright as they are, because Playwright uses `KeyboardEvent.key` names.
 *
 * @example
 * const driver = createPlaywrightComputerDriver({ page })
 *
 * @throws Error when the page has no viewport size.
 */
export function createPlaywrightComputerDriver({
  page,
}: PlaywrightComputerDriverOptions) {
  const display = page.viewportSize()
  if (display === null) {
    throw new Error(
      'The page has no viewport size. Set a viewport on the browser context.',
    )
  }

  async function history(button: 'back' | 'forward') {
    if (button === 'back') await page.goBack()
    else await page.goForward()
  }

  const driver: ComputerDriver = {
    display,
    environment: 'browser',
    screenshot: () => page.screenshot({ type: 'png' }),
    async click(x, y, { button, count }) {
      if (button === 'back' || button === 'forward') return history(button)
      await page.mouse.click(x, y, { button, clickCount: count })
    },
    move: (x, y) => page.mouse.move(x, y),
    async mouseDown(button: MouseButton) {
      // ponytail: back and forward navigate once, on mouseUp. mouseDown does nothing for them.
      if (button === 'back' || button === 'forward') return
      await page.mouse.down({ button })
    },
    async mouseUp(button: MouseButton) {
      if (button === 'back' || button === 'forward') return history(button)
      await page.mouse.up({ button })
    },
    async scroll(x, y, deltaX, deltaY) {
      await page.mouse.move(x, y)
      await page.mouse.wheel(deltaX, deltaY)
    },
    keyDown: (key) => page.keyboard.down(key),
    keyUp: (key) => page.keyboard.up(key),
    press: (keys) => page.keyboard.press(keys.join('+')),
    type: (text) => page.keyboard.type(text),
    zoom: (region) => page.screenshot({ type: 'png', clip: region }),
    navigate: async (url) => {
      await page.goto(url)
    },
  }
  return driver
}

/**
 * Create a driver factory that gives each thread its own browser page.
 *
 * Each thread gets its own browser context, with its own cookies and
 * storage. When the thread closes, its context closes. When you pass no
 * `browser`, the factory launches Chromium once, on the first thread, and
 * `close()` on the factory closes it.
 *
 * Without `browser`, the factory launches Chromium on the first thread.
 * Install `playwright-core` and Chromium before that.
 *
 * @param options - The start URL, the display, and the browser or the launch options.
 *
 * @example
 * const computer = createComputerUse({
 *   driver: playwrightComputer({ startUrl: 'https://tanstack.com' }),
 * })
 */
export function playwrightComputer(options: PlaywrightComputerOptions = {}) {
  const { startUrl, browser, launch } = options
  const display = options.display ?? { width: 1280, height: 800 }
  let launched: Promise<PlaywrightBrowserLike> | null = null

  async function launchChromium() {
    const { chromium } = await import('playwright-core')
    return chromium.launch(launch)
  }

  function getBrowser() {
    if (browser !== undefined) return Promise.resolve(browser)
    launched ??= launchChromium().catch((error: unknown) => {
      launched = null
      throw error
    })
    return launched
  }

  const factory: ComputerDriverFactory = {
    display,
    environment: 'browser',
    capabilities: { zoom: true, cursorPosition: false, navigate: true },
    async create() {
      const shared = await getBrowser()
      const context = await shared.newContext({ viewport: display })
      try {
        const page = await context.newPage()
        if (startUrl !== undefined) await page.goto(startUrl)
        return {
          ...createPlaywrightComputerDriver({ page }),
          close: () => context.close(),
        }
      } catch (error) {
        // Keep the page error. A failed close does not replace it.
        await context.close().catch((closeError: unknown) => {
          console.error(
            'Failed to close the Playwright context after setup failed.',
            closeError,
          )
        })
        throw error
      }
    },
    async close() {
      const current = launched
      launched = null
      if (current === null) return
      await (await current).close()
    },
  }
  return factory
}
