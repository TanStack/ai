import { Sandbox } from '@e2b/desktop'
import type {
  ComputerDriver,
  ComputerDriverFactory,
  MouseButton,
} from '@tanstack/ai-computer-use'

/** The parts of an `@e2b/desktop` `Sandbox` that the driver uses. */
export interface E2BDesktopLike {
  getScreenSize: () => Promise<{ width: number; height: number }>
  getCursorPosition: () => Promise<{ x: number; y: number }>
  screenshot: (format: 'bytes') => Promise<Uint8Array>
  moveMouse: (x: number, y: number) => Promise<void>
  leftClick: () => Promise<void>
  doubleClick: () => Promise<void>
  rightClick: () => Promise<void>
  middleClick: () => Promise<void>
  mousePress: (button: 'left' | 'right' | 'middle') => Promise<void>
  mouseRelease: (button: 'left' | 'right' | 'middle') => Promise<void>
  scroll: (direction: 'up' | 'down', amount: number) => Promise<void>
  write: (text: string) => Promise<void>
  commands: { run: (cmd: string) => Promise<unknown> }
}

/** Options for {@link createE2BComputerDriver}. */
export interface E2BComputerDriverOptions {
  /** The E2B desktop sandbox to control. The driver does not create or kill it. */
  desktop: E2BDesktopLike
}

/** `KeyboardEvent.key` names that differ from the xdotool names. Other names pass through. */
const XDOTOOL_KEYS: Record<string, string> = {
  Control: 'ctrl',
  Shift: 'shift',
  Alt: 'alt',
  Meta: 'super',
  Enter: 'Return',
  Backspace: 'BackSpace',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  PageUp: 'Page_Up',
  PageDown: 'Page_Down',
  CapsLock: 'Caps_Lock',
  ' ': 'space',
  '+': 'plus',
}

/** xdotool button numbers. */
const BUTTONS: Record<MouseButton, number> = {
  left: 1,
  middle: 2,
  right: 3,
  back: 8,
  forward: 9,
}

// ponytail: one scroll click is 100 px. Fine steps below 100 px round to one click.
const PIXELS_PER_SCROLL_CLICK = 100

function toXdotoolKey(key: string) {
  return XDOTOOL_KEYS[key] ?? key
}

/** Quote one value for a POSIX shell. The model picks key names, so they never reach the shell raw. */
function quote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

function int(value: number) {
  if (!Number.isInteger(value)) {
    throw new Error(`Expected an integer, got ${value}`)
  }
  return value
}

function scrollClicks(pixels: number) {
  return Math.max(1, Math.round(Math.abs(pixels) / PIXELS_PER_SCROLL_CLICK))
}

/**
 * Create a `ComputerDriver` for an E2B desktop sandbox.
 *
 * It reads the screen size once, so call it after the desktop is ready.
 *
 * @example
 * const desktop = await Sandbox.create()
 * const driver = await createE2BComputerDriver({ desktop })
 */
export async function createE2BComputerDriver({
  desktop,
}: E2BComputerDriverOptions) {
  const display = await desktop.getScreenSize()
  const run = (cmd: string) => desktop.commands.run(cmd)

  const sdkClick = async (button: MouseButton, count: number) => {
    const isLeft = button === 'left'
    if (isLeft && count === 1) return desktop.leftClick()
    if (isLeft && count === 2) return desktop.doubleClick()
    if (button === 'right' && count === 1) return desktop.rightClick()
    if (button === 'middle' && count === 1) return desktop.middleClick()
    await run(`xdotool click --repeat ${int(count)} ${BUTTONS[button]}`)
  }

  const driver: ComputerDriver = {
    display,
    environment: 'linux',
    screenshot: () => desktop.screenshot('bytes'),
    async click(x, y, { button, count }) {
      // The SDK click methods skip the move when x or y is 0, so move first.
      await desktop.moveMouse(int(x), int(y))
      await sdkClick(button, count)
    },
    async move(x, y) {
      await desktop.moveMouse(int(x), int(y))
    },
    async mouseDown(button) {
      if (button === 'back' || button === 'forward') {
        await run(`xdotool mousedown ${BUTTONS[button]}`)
        return
      }
      await desktop.mousePress(button)
    },
    async mouseUp(button) {
      if (button === 'back' || button === 'forward') {
        await run(`xdotool mouseup ${BUTTONS[button]}`)
        return
      }
      await desktop.mouseRelease(button)
    },
    async scroll(x, y, deltaX, deltaY) {
      await desktop.moveMouse(int(x), int(y))
      if (deltaY !== 0) {
        await desktop.scroll(deltaY > 0 ? 'down' : 'up', scrollClicks(deltaY))
      }
      if (deltaX !== 0) {
        // The SDK has no horizontal scroll. xdotool buttons 6 and 7 scroll left and right.
        const button = deltaX > 0 ? 7 : 6
        await run(`xdotool click --repeat ${scrollClicks(deltaX)} ${button}`)
      }
    },
    async keyDown(key) {
      await run(`xdotool keydown -- ${quote(toXdotoolKey(key))}`)
    },
    async keyUp(key) {
      await run(`xdotool keyup -- ${quote(toXdotoolKey(key))}`)
    },
    async press(keys) {
      // The SDK press puts the names in the shell raw and lowercases them, so quote them here.
      await run(`xdotool key -- ${quote(keys.map(toXdotoolKey).join('+'))}`)
    },
    type: (text) => desktop.write(text),
    cursorPosition: () => desktop.getCursorPosition(),
  }
  return driver
}

/**
 * The options of `Sandbox.create` from `@e2b/desktop`. The package does not
 * export this type. Its `SandboxOpts` export is the base `e2b` type, without
 * `resolution`. Both `create` signatures take these options last.
 */
type DesktopSandboxOpts = NonNullable<Parameters<typeof Sandbox.create>[1]>

/**
 * Options for {@link e2bComputer}. Every option except `display` goes to
 * `Sandbox.create` from `@e2b/desktop`, like `apiKey`, `timeoutMs`, and
 * `template`.
 */
export type E2BComputerOptions = Omit<
  DesktopSandboxOpts,
  'resolution' | 'display'
> & {
  /**
   * The screen size in pixels. Each sandbox starts at this resolution.
   * The default is `{ width: 1024, height: 768 }`.
   */
  display?: { width: number; height: number }
}

/**
 * Create a driver factory that starts one E2B desktop sandbox for each thread.
 *
 * When `createComputerUse` closes a thread, or the thread goes idle, the
 * sandbox of that thread is killed. The drivers have `cursorPosition`. They
 * have no `zoom` and no `navigate`, because a desktop has no address. The
 * model opens the browser on the desktop.
 *
 * ponytail: E2B kills a sandbox after its own `timeoutMs`, even when the
 * thread is busy. Pass a `timeoutMs` above `idleTimeout` plus the longest
 * thread.
 *
 * @param options - The `display` size and the `Sandbox.create` options.
 *
 * @example
 * const computer = createComputerUse({
 *   driver: e2bComputer({ timeoutMs: 30 * 60_000 }),
 * })
 */
export function e2bComputer(options: E2BComputerOptions = {}) {
  const {
    display = { width: 1024, height: 768 },
    template,
    ...sandboxOptions
  } = options

  const factory: ComputerDriverFactory = {
    display,
    environment: 'linux',
    capabilities: { zoom: false, cursorPosition: true, navigate: false },
    async create() {
      const createOptions: DesktopSandboxOpts = {
        ...sandboxOptions,
        resolution: [display.width, display.height],
      }
      // The desktop SDK reads the template only from the first argument.
      const desktop =
        template === undefined
          ? await Sandbox.create(createOptions)
          : await Sandbox.create(template, createOptions)
      const driver = await createE2BComputerDriver({ desktop }).catch(
        async (error: unknown) => {
          // Keep the setup error. A failed kill does not replace it.
          await desktop.kill().catch(() => undefined)
          throw error
        },
      )
      return {
        ...driver,
        close: async () => {
          await desktop.kill()
        },
      }
    },
  }
  return factory
}
