import { crc32, inflateSync } from 'node:zlib'
import { afterEach, describe, expect, it } from 'vitest'
import { localComputer } from '../src/index'
import type { RobotLike } from '../src/index'

type Size = { width: number; height: number }
type Rgb = readonly [number, number, number]

const RED: Rgb = [255, 0, 0]
const BLACK: Rgb = [0, 0, 0]
const BLUE: Rgb = [0, 0, 255]

/** Extra bytes at the end of each bitmap row, as macOS adds. */
const ROW_PADDING = 4

/** A 4 x 2 screen: red over black on the left half, blue on the right half. */
function testColor(x: number, y: number) {
  if (x >= 2) return BLUE
  return y === 0 ? RED : BLACK
}

/** A robotjs bitmap of one screen region: blue, green, red, unused, with padded rows. */
function capture(
  color: (x: number, y: number) => Rgb,
  region: { x: number; y: number } & Size,
) {
  const byteWidth = region.width * 4 + ROW_PADDING
  const image = new Uint8Array(byteWidth * region.height).fill(99)
  for (let y = 0; y < region.height; y++) {
    for (let x = 0; x < region.width; x++) {
      const [red, green, blue] = color(region.x + x, region.y + y)
      image.set([blue, green, red, 255], y * byteWidth + x * 4)
    }
  }
  return { ...region, byteWidth, bytesPerPixel: 4, image }
}

/** A fake robot on a screen of the given size. Each call adds one line to `calls`. */
function fakeRobot(screen: Size = { width: 2560, height: 1440 }) {
  const calls: Array<string> = []
  const record =
    (name: string) =>
    (...args: Array<string | number | boolean | undefined>) => {
      calls.push([name, ...args].join(' ').trim())
    }
  const robot: RobotLike = {
    getScreenSize: () => screen,
    getMousePos: () => ({ x: 640, y: 360 }),
    moveMouse: record('moveMouse'),
    mouseClick: record('mouseClick'),
    mouseToggle: record('mouseToggle'),
    scrollMouse: record('scrollMouse'),
    keyToggle: record('keyToggle'),
    typeString: record('typeString'),
    screen: {
      capture: (x = 0, y = 0, width = screen.width, height = screen.height) => {
        record('capture')(x, y, width, height)
        return capture(testColor, { x, y, width, height })
      },
    },
  }
  return { robot, calls }
}

/** Decode a PNG. Checks the signature and the CRC of each chunk. */
function readPng(png: Uint8Array) {
  const bytes = Buffer.from(png)
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10])
  const chunks = new Map<string, Buffer>()
  let offset = 8
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset)
    const end = offset + 8 + length
    expect(bytes.readUInt32BE(end)).toBe(crc32(bytes.subarray(offset + 4, end)))
    chunks.set(
      bytes.toString('latin1', offset + 4, offset + 8),
      bytes.subarray(offset + 8, end),
    )
    offset = end + 4
  }
  const header = chunks.get('IHDR') ?? Buffer.alloc(13)
  return {
    width: header.readUInt32BE(0),
    height: header.readUInt32BE(4),
    colorType: header[9],
    rows: [...inflateSync(chunks.get('IDAT') ?? Buffer.alloc(0))],
  }
}

const realPlatform = Object.getOwnPropertyDescriptor(process, 'platform')

function setPlatform(platform: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: platform })
}

afterEach(() => {
  if (realPlatform) Object.defineProperty(process, 'platform', realPlatform)
})

describe('localComputer display', () => {
  it('scales a big screen down to fit in 1280 x 800', () => {
    const { robot } = fakeRobot({ width: 2560, height: 1440 })
    expect(localComputer({ robot }).display).toEqual({
      width: 1280,
      height: 720,
    })
  })

  it('keeps a small screen at its own size', () => {
    const { robot } = fakeRobot({ width: 1024, height: 768 })
    expect(localComputer({ robot }).display).toEqual({
      width: 1024,
      height: 768,
    })
  })

  it.each([
    ['win32', 'windows'],
    ['darwin', 'mac'],
    ['linux', 'linux'],
  ] as const)('reports %s as %s', (platform, environment) => {
    setPlatform(platform)
    expect(localComputer({ robot: fakeRobot().robot }).environment).toBe(
      environment,
    )
  })
})

describe('localComputer mouse', () => {
  it('clicks at the screen point, scaled up from the display', async () => {
    const { robot, calls } = fakeRobot()
    await localComputer({ robot }).click(100, 50, { button: 'left', count: 1 })
    expect(calls).toEqual(['moveMouse 200 100', 'mouseClick left'])
  })

  it('sends a double click as one robotjs double click', async () => {
    const { robot, calls } = fakeRobot()
    await localComputer({ robot }).click(100, 50, { button: 'right', count: 2 })
    expect(calls).toEqual(['moveMouse 200 100', 'mouseClick right true'])
  })

  it('sends a triple click as three clicks', async () => {
    const { robot, calls } = fakeRobot()
    await localComputer({ robot }).click(100, 50, { button: 'left', count: 3 })
    expect(calls).toEqual([
      'moveMouse 200 100',
      'mouseClick left',
      'mouseClick left',
      'mouseClick left',
    ])
  })

  it('rejects the back button before the mouse moves', async () => {
    const { robot, calls } = fakeRobot()
    const click = localComputer({ robot }).click(1, 1, {
      button: 'back',
      count: 1,
    })
    await expect(click).rejects.toThrow(
      'The local computer has no "back" mouse button.',
    )
    expect(calls).toEqual([])
  })

  it('holds and releases a mouse button', async () => {
    const { robot, calls } = fakeRobot()
    const driver = localComputer({ robot })
    await driver.mouseDown('middle')
    await driver.mouseUp('middle')
    expect(calls).toEqual(['mouseToggle down middle', 'mouseToggle up middle'])
  })

  it('reports the mouse position in display space', async () => {
    const { robot } = fakeRobot()
    expect(await localComputer({ robot }).cursorPosition()).toEqual({
      x: 320,
      y: 180,
    })
  })

  it.each([
    ['darwin', 0, 120, 'scrollMouse 0 -120'],
    ['darwin', 40, 0, 'scrollMouse -40 0'],
    ['win32', 0, 100, 'scrollMouse 0 -120'],
    ['win32', -50, 0, 'scrollMouse 60 0'],
    ['linux', 0, 250, 'scrollMouse 0 -3'],
    ['linux', 0, 30, 'scrollMouse 0 -1'],
  ] as const)(
    'on %s, scrolls %i, %i px as "%s"',
    async (platform, deltaX, deltaY, expected) => {
      setPlatform(platform)
      const { robot, calls } = fakeRobot({ width: 1280, height: 800 })
      await localComputer({ robot }).scroll(10, 20, deltaX, deltaY)
      expect(calls).toEqual(['moveMouse 10 20', expected])
    },
  )
})

describe('localComputer keyboard', () => {
  it('presses a combo in order, then releases it in reverse', async () => {
    const { robot, calls } = fakeRobot()
    await localComputer({ robot }).press(['Control', 'Shift', 'ArrowLeft'])
    expect(calls).toEqual([
      'keyToggle control down',
      'keyToggle shift down',
      'keyToggle left down',
      'keyToggle left up',
      'keyToggle shift up',
      'keyToggle control up',
    ])
  })

  it('releases the pressed keys when a later key is not valid', async () => {
    const { robot, calls } = fakeRobot()
    const keyToggle = robot.keyToggle
    robot.keyToggle = (key, down) => {
      if (key === 'not_a_key') throw new Error('Invalid key code specified.')
      keyToggle(key, down)
    }
    const press = localComputer({ robot }).press([
      'Control',
      'Shift',
      'NOT_A_KEY',
    ])
    await expect(press).rejects.toThrow('Invalid key code specified.')
    expect(calls).toEqual([
      'keyToggle control down',
      'keyToggle shift down',
      'keyToggle shift up',
      'keyToggle control up',
    ])
  })

  it('sends robotjs key names', async () => {
    const { robot, calls } = fakeRobot()
    const driver = localComputer({ robot })
    const keys = [
      'Meta',
      ' ',
      'Enter',
      'F5',
      'PageDown',
      'ContextMenu',
      'a',
      'A',
    ]
    for (const key of keys) await driver.keyDown(key)
    expect(calls).toEqual([
      'keyToggle command down',
      'keyToggle space down',
      'keyToggle enter down',
      'keyToggle f5 down',
      'keyToggle pagedown down',
      'keyToggle menu down',
      'keyToggle a down',
      'keyToggle A down',
    ])
  })

  it('types the text', async () => {
    const { robot, calls } = fakeRobot()
    await localComputer({ robot }).type('hello world')
    expect(calls).toEqual(['typeString hello world'])
  })
})

describe('localComputer screen', () => {
  it('takes a screenshot at the display size, with each pixel the average of the pixels it covers', async () => {
    const { robot } = fakeRobot({ width: 4, height: 2 })
    const png = readPng(
      await localComputer({
        robot,
        display: { width: 2, height: 1 },
      }).screenshot(),
    )
    expect(png).toEqual({
      width: 2,
      height: 1,
      colorType: 2,
      rows: [0, 128, 0, 0, 0, 0, 255],
    })
  })

  it('zooms into a region at the full screen size', async () => {
    const { robot, calls } = fakeRobot({ width: 4, height: 2 })
    const driver = localComputer({ robot, display: { width: 2, height: 1 } })
    const png = readPng(await driver.zoom({ x: 1, y: 0, width: 1, height: 1 }))
    expect(calls).toEqual(['capture 2 0 2 2'])
    expect(png).toEqual({
      width: 2,
      height: 2,
      colorType: 2,
      rows: [0, 0, 0, 255, 0, 0, 255, 0, 0, 0, 255, 0, 0, 255],
    })
  })

  it.each([
    [
      'past the bottom right',
      { x: 1, y: 0, width: 5, height: 3 },
      'capture 2 0 2 2',
    ],
    [
      'before the top left',
      { x: -3, y: -1, width: 1, height: 1 },
      'capture 0 0 1 1',
    ],
  ])('keeps a zoom region %s on the screen', async (_, region, expected) => {
    const { robot, calls } = fakeRobot({ width: 4, height: 2 })
    await localComputer({ robot, display: { width: 2, height: 1 } }).zoom(
      region,
    )
    expect(calls).toEqual([expected])
  })
})
