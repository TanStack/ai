import { createRequire } from 'node:module'
import { toPng } from './png'
import type { ComputerDriver, MouseButton } from '@tanstack/ai-computer-use'
import type { Bitmap } from './png'

/** The parts of `@jitsi/robotjs` that the driver uses. */
export interface RobotLike {
  getScreenSize: () => { width: number; height: number }
  getMousePos: () => { x: number; y: number }
  moveMouse: (x: number, y: number) => void
  mouseClick: (button?: string, double?: boolean) => void
  mouseToggle: (down?: string, button?: string) => void
  scrollMouse: (x: number, y: number) => void
  keyToggle: (key: string, down: string) => void
  typeString: (text: string) => void
  screen: {
    capture: (x?: number, y?: number, width?: number, height?: number) => Bitmap
  }
}

/** Options for {@link localComputer}. */
export interface LocalComputerOptions {
  /**
   * The size of the screenshots that the model sees. The driver scales each
   * screenshot down to this size, and scales each point from the model up to
   * the screen. The default is the screen size, scaled down to fit in
   * 1280 x 800.
   */
  display?: { width: number; height: number }
  /** The robot that moves the mouse and presses the keys. The default is `@jitsi/robotjs`. */
  robot?: RobotLike
}

/** The largest default display. Bigger screenshots cost more tokens, and the providers scale them down anyway. */
const MAX_DISPLAY = { width: 1280, height: 800 }

/** `KeyboardEvent.key` names that differ from the robotjs names. Other names are lowercased. */
const ROBOT_KEYS: Record<string, string> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Meta: 'command',
  ContextMenu: 'menu',
  ' ': 'space',
}

function toRobotKey(key: string) {
  return ROBOT_KEYS[key] ?? (key.length === 1 ? key : key.toLowerCase())
}

function toRobotButton(button: MouseButton) {
  if (button === 'back' || button === 'forward') {
    throw new Error(`The local computer has no "${button}" mouse button.`)
  }
  return button
}

function currentEnvironment() {
  if (process.platform === 'win32') return 'windows'
  if (process.platform === 'darwin') return 'mac'
  return 'linux'
}

/** robotjs scrolls in pixels on macOS, in wheel clicks on Linux, and in 120 units for each wheel notch on Windows. */
function scrollUnits(pixels: number) {
  if (pixels === 0 || process.platform === 'darwin') return pixels
  // ponytail: one wheel notch is about 100 px.
  const notches = pixels / 100
  if (process.platform === 'win32') return Math.round(notches * 120)
  return Math.sign(pixels) * Math.max(1, Math.round(Math.abs(notches)))
}

function fitDisplay(screen: { width: number; height: number }) {
  const scale = Math.min(
    1,
    MAX_DISPLAY.width / screen.width,
    MAX_DISPLAY.height / screen.height,
  )
  return {
    width: Math.round(screen.width * scale),
    height: Math.round(screen.height * scale),
  }
}

/** Load robotjs on the first call, so an import of this package does not load the native addon. */
function loadRobot() {
  return createRequire(import.meta.url)('@jitsi/robotjs')
}

/**
 * Create a `ComputerDriver` for the machine that runs this code. The model
 * controls the real mouse, keyboard, and main screen.
 *
 * All threads share this one machine. `createComputerUse` never closes it.
 *
 * CAUTION: the model can do on this machine what you can do. Use a VM or
 * `sandboxComputer` from `@tanstack/ai-computer-sandbox` when you cannot watch it.
 *
 * Needs `@jitsi/robotjs`. On macOS, give the app that runs Node the
 * Accessibility and Screen Recording permissions. On Linux, it needs X11.
 *
 * @example
 * const computerUse = createComputerUse({ driver: localComputer() })
 */
export function localComputer(options: LocalComputerOptions = {}) {
  const robot: RobotLike = options.robot ?? loadRobot()
  const screen = robot.getScreenSize()
  const display = options.display ?? fitDisplay(screen)

  /** Scale a point or a size from the display to the screen. */
  const toScreen = (x: number, y: number) => ({
    x: Math.round((x * screen.width) / display.width),
    y: Math.round((y * screen.height) / display.height),
  })
  const moveTo = (x: number, y: number) => {
    const point = toScreen(x, y)
    robot.moveMouse(point.x, point.y)
  }

  return {
    display,
    environment: currentEnvironment(),
    screenshot: async () =>
      toPng(robot.screen.capture(), display.width, display.height),
    async click(x, y, { button, count }) {
      const name = toRobotButton(button)
      moveTo(x, y)
      // robotjs sends a real double click, which macOS needs.
      if (count === 2) return robot.mouseClick(name, true)
      // ponytail: macOS sees a triple click as three single clicks.
      for (let i = 0; i < count; i++) robot.mouseClick(name)
    },
    async move(x, y) {
      moveTo(x, y)
    },
    async mouseDown(button) {
      robot.mouseToggle('down', toRobotButton(button))
    },
    async mouseUp(button) {
      robot.mouseToggle('up', toRobotButton(button))
    },
    async scroll(x, y, deltaX, deltaY) {
      moveTo(x, y)
      const delta = toScreen(deltaX, deltaY)
      // robotjs scrolls right and down for negative values.
      robot.scrollMouse(scrollUnits(-delta.x), scrollUnits(-delta.y))
    },
    async keyDown(key) {
      robot.keyToggle(toRobotKey(key), 'down')
    },
    async keyUp(key) {
      robot.keyToggle(toRobotKey(key), 'up')
    },
    async press(keys) {
      // Release the pressed keys also when a later key is not valid.
      const pressed: Array<string> = []
      try {
        for (const name of keys.map(toRobotKey)) {
          robot.keyToggle(name, 'down')
          pressed.push(name)
        }
      } finally {
        for (const name of pressed.reverse()) robot.keyToggle(name, 'up')
      }
    },
    async type(text) {
      robot.typeString(text)
    },
    async cursorPosition() {
      const { x, y } = robot.getMousePos()
      return {
        x: Math.round((x * display.width) / screen.width),
        y: Math.round((y * display.height) / screen.height),
      }
    },
    async zoom(region) {
      // robotjs does not check the region. A region off the screen can crash Node.
      const start = toScreen(region.x, region.y)
      const end = toScreen(region.x + region.width, region.y + region.height)
      const x = Math.min(Math.max(start.x, 0), screen.width - 1)
      const y = Math.min(Math.max(start.y, 0), screen.height - 1)
      const bitmap = robot.screen.capture(
        x,
        y,
        Math.max(1, Math.min(end.x, screen.width) - x),
        Math.max(1, Math.min(end.y, screen.height) - y),
      )
      return toPng(bitmap, bitmap.width, bitmap.height)
    },
  } satisfies ComputerDriver
}
