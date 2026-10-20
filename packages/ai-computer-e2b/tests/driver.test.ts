import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createE2BComputerDriver, e2bComputer } from '../src/index'
import type { E2BDesktopLike } from '../src/index'

/** A desktop as `Sandbox.create` returns it, with `kill`. */
type FakeDesktop = E2BDesktopLike & { kill: () => Promise<void> }

const { create } = vi.hoisted(() => ({
  create: vi.fn<(...args: Array<unknown>) => Promise<FakeDesktop>>(),
}))

vi.mock('@e2b/desktop', () => ({ Sandbox: { create } }))

const PNG = new Uint8Array([137, 80, 78, 71])

/** A fake desktop. Each SDK call adds one line to `calls`. */
function fakeDesktop(overrides: Partial<FakeDesktop> = {}) {
  const calls: Array<string> = []
  const record =
    (name: string) =>
    async (...args: Array<string | number>) => {
      calls.push([name, ...args].join(' '))
    }
  const desktop: FakeDesktop = {
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
    kill: record('kill'),
    ...overrides,
  }
  return { desktop, calls }
}

async function setup() {
  const { desktop, calls } = fakeDesktop()
  const driver = await createE2BComputerDriver({ desktop })
  return { driver, calls }
}

/** Make each `Sandbox.create` call return a new fake desktop. Returns the fakes in create order. */
function mockSandboxes() {
  const sandboxes: Array<ReturnType<typeof fakeDesktop>> = []
  create.mockImplementation(async () => {
    const sandbox = fakeDesktop()
    sandboxes.push(sandbox)
    return sandbox.desktop
  })
  return sandboxes
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

describe('e2bComputer', () => {
  beforeEach(() => {
    create.mockReset()
  })

  it('reports a linux desktop with cursor position only', () => {
    const factory = e2bComputer()
    expect(factory.display).toEqual({ width: 1024, height: 768 })
    expect(factory.environment).toBe('linux')
    expect(factory.capabilities).toEqual({
      zoom: false,
      cursorPosition: true,
      navigate: false,
    })
    expect(factory.close).toBeUndefined()
  })

  it('creates the sandbox at the default resolution', async () => {
    mockSandboxes()
    await e2bComputer().create({ threadId: 'a' })
    expect(create).toHaveBeenCalledWith({ resolution: [1024, 768] })
  })

  it('passes the sandbox options through and takes the resolution from display', async () => {
    mockSandboxes()
    const factory = e2bComputer({
      apiKey: 'key',
      timeoutMs: 60_000,
      display: { width: 800, height: 600 },
    })
    await factory.create({ threadId: 'a' })
    expect(factory.display).toEqual({ width: 800, height: 600 })
    expect(create).toHaveBeenCalledWith({
      apiKey: 'key',
      timeoutMs: 60_000,
      resolution: [800, 600],
    })
  })

  it('gives the template to Sandbox.create as the first argument', async () => {
    mockSandboxes()
    await e2bComputer({ template: 'my-desktop' }).create({ threadId: 'a' })
    expect(create).toHaveBeenCalledWith('my-desktop', {
      resolution: [1024, 768],
    })
  })

  it('creates one sandbox for each thread', async () => {
    const sandboxes = mockSandboxes()
    const factory = e2bComputer()
    const a = await factory.create({ threadId: 'a' })
    const b = await factory.create({ threadId: 'b' })
    await a.move(1, 2)
    await b.move(3, 4)
    expect(sandboxes.map(({ calls }) => calls)).toEqual([
      ['moveMouse 1 2'],
      ['moveMouse 3 4'],
    ])
  })

  it('kills only the sandbox of the closed driver', async () => {
    const sandboxes = mockSandboxes()
    const factory = e2bComputer()
    const a = await factory.create({ threadId: 'a' })
    await factory.create({ threadId: 'b' })
    await a.close?.()
    expect(sandboxes.map(({ calls }) => calls)).toEqual([['kill'], []])
  })

  it('kills the sandbox and rethrows when the driver setup fails', async () => {
    const { desktop, calls } = fakeDesktop({
      getScreenSize: () => Promise.reject(new Error('no screen')),
    })
    create.mockResolvedValue(desktop)
    await expect(e2bComputer().create({ threadId: 'a' })).rejects.toThrow(
      'no screen',
    )
    expect(calls).toEqual(['kill'])
  })
})
