import { describe, expect, it } from 'vitest'
import { createE2BComputerDriver } from '../src/index'
import type { E2BDesktopLike } from '../src/index'

const PNG = new Uint8Array([137, 80, 78, 71])

/** A fake desktop. Each SDK call adds one line to `calls`. */
function fakeDesktop() {
  const calls: Array<string> = []
  const record =
    (name: string) =>
    async (...args: Array<string | number>) => {
      calls.push([name, ...args].join(' '))
    }
  const desktop: E2BDesktopLike = {
    getScreenSize: async () => ({ width: 1024, height: 768 }),
    getCursorPosition: async () => ({ x: 12, y: 34 }),
    screenshot: async () => PNG,
    moveMouse: record('moveMouse'),
    leftClick: record('leftClick'),
    doubleClick: record('doubleClick'),
    rightClick: record('rightClick'),
    middleClick: record('middleClick'),
    mousePress: record('mousePress'),
    mouseRelease: record('mouseRelease'),
    scroll: record('scroll'),
    write: record('write'),
    commands: { run: record('run') },
  }
  return { desktop, calls }
}

async function setup() {
  const { desktop, calls } = fakeDesktop()
  const driver = await createE2BComputerDriver({ desktop })
  return { driver, calls }
}

describe('createE2BComputerDriver', () => {
  it('reads the display once and reports linux', async () => {
    const { driver } = await setup()
    expect(driver.display).toEqual({ width: 1024, height: 768 })
    expect(driver.environment).toBe('linux')
    expect(driver.zoom).toBeUndefined()
  })

  it('returns the screenshot bytes and the cursor position', async () => {
    const { driver } = await setup()
    expect(await driver.screenshot()).toBe(PNG)
    expect(await driver.cursorPosition?.()).toEqual({ x: 12, y: 34 })
  })

  it.each([
    ['left', 1, 'leftClick'],
    ['left', 2, 'doubleClick'],
    ['right', 1, 'rightClick'],
    ['middle', 1, 'middleClick'],
    ['left', 3, 'run xdotool click --repeat 3 1'],
    ['back', 1, 'run xdotool click --repeat 1 8'],
    ['forward', 1, 'run xdotool click --repeat 1 9'],
  ] as const)('clicks %s x%i with %s', async (button, count, expected) => {
    const { driver, calls } = await setup()
    await driver.click(0, 5, { button, count })
    expect(calls).toEqual(['moveMouse 0 5', expected])
  })

  it('moves the mouse', async () => {
    const { driver, calls } = await setup()
    await driver.move(10, 20)
    expect(calls).toEqual(['moveMouse 10 20'])
  })

  it('rejects a coordinate that is not an integer', async () => {
    const { driver, calls } = await setup()
    await expect(driver.move(1.5, 2)).rejects.toThrow('Expected an integer')
    expect(calls).toEqual([])
  })

  it('presses and releases buttons', async () => {
    const { driver, calls } = await setup()
    await driver.mouseDown('left')
    await driver.mouseUp('right')
    await driver.mouseDown('back')
    await driver.mouseUp('forward')
    expect(calls).toEqual([
      'mousePress left',
      'mouseRelease right',
      'run xdotool mousedown 8',
      'run xdotool mouseup 9',
    ])
  })

  it('scrolls down and right in 100 px clicks', async () => {
    const { driver, calls } = await setup()
    await driver.scroll(5, 6, 200, 300)
    expect(calls).toEqual([
      'moveMouse 5 6',
      'scroll down 3',
      'run xdotool click --repeat 2 7',
    ])
  })

  it('scrolls up and left, at least one click', async () => {
    const { driver, calls } = await setup()
    await driver.scroll(5, 6, -10, -40)
    expect(calls).toEqual([
      'moveMouse 5 6',
      'scroll up 1',
      'run xdotool click --repeat 1 6',
    ])
  })

  it('maps key names to xdotool names', async () => {
    const { driver, calls } = await setup()
    await driver.press(['Control', 'Shift', 'ArrowLeft'])
    await driver.press([' '])
    await driver.keyDown('Meta')
    await driver.keyUp('Enter')
    expect(calls).toEqual([
      "run xdotool key -- 'ctrl+shift+Left'",
      "run xdotool key -- 'space'",
      "run xdotool keydown -- 'super'",
      "run xdotool keyup -- 'Return'",
    ])
  })

  it('passes an unknown key name through', async () => {
    const { driver, calls } = await setup()
    await driver.press(['F1'])
    await driver.press(['a'])
    expect(calls).toEqual(["run xdotool key -- 'F1'", "run xdotool key -- 'a'"])
  })

  it('quotes a key name with shell characters', async () => {
    const { driver, calls } = await setup()
    await driver.keyDown("a'; rm -rf / #")
    expect(calls).toEqual([`run xdotool keydown -- 'a'"'"'; rm -rf / #'`])
  })

  it('types text with the SDK write', async () => {
    const { driver, calls } = await setup()
    await driver.type('hello')
    expect(calls).toEqual(['write hello'])
  })
})
