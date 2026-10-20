import { describe, expect, it } from 'vitest'
import { createPlaywrightComputerDriver } from '../src/index'
import type { PlaywrightPageLike } from '../src/index'

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
  }
  return { page, calls }
}

function setup() {
  const { page, calls } = createFakePage()
  return { driver: createPlaywrightComputerDriver({ page }), calls }
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
})
