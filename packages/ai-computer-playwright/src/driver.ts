import type { ComputerDriver, MouseButton } from '@tanstack/ai-computer-use'

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
}

export interface PlaywrightComputerDriverOptions {
  /** The page to control. It must have a viewport size. */
  page: PlaywrightPageLike
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

  async function navigate(button: 'back' | 'forward') {
    if (button === 'back') await page.goBack()
    else await page.goForward()
  }

  const driver: ComputerDriver = {
    display,
    environment: 'browser',
    screenshot: () => page.screenshot({ type: 'png' }),
    async click(x, y, { button, count }) {
      if (button === 'back' || button === 'forward') return navigate(button)
      await page.mouse.click(x, y, { button, clickCount: count })
    },
    move: (x, y) => page.mouse.move(x, y),
    async mouseDown(button: MouseButton) {
      // ponytail: back and forward navigate once, on mouseUp. mouseDown does nothing for them.
      if (button === 'back' || button === 'forward') return
      await page.mouse.down({ button })
    },
    async mouseUp(button: MouseButton) {
      if (button === 'back' || button === 'forward') return navigate(button)
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
  }
  return driver
}
