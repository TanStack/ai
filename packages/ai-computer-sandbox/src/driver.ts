import { base64ToUint8Array, generateId } from '@tanstack/ai-utils'
import type {
  ComputerDriver,
  ComputerDriverFactory,
  MouseButton,
} from '@tanstack/ai-computer-use'
import type { SandboxHandle, SandboxProvider } from '@tanstack/ai-sandbox'

/** Options for {@link createSandboxComputerDriver}. */
export interface SandboxComputerDriverOptions {
  /** The sandbox to control. The driver does not create or destroy it. */
  sandbox: Pick<SandboxHandle, 'process'>
  /**
   * The screen size in pixels when the driver starts the display. When a
   * display already runs, the driver uses its size. The default is
   * `{ width: 1024, height: 768 }`.
   */
  display?: { width: number; height: number }
}

/** Options for {@link sandboxComputer}. */
export interface SandboxComputerOptions {
  /** Creates one sandbox for each thread, like `e2bSandbox({ template: 'desktop' })`. */
  provider: SandboxProvider
  /** The screen size in pixels. The default is `{ width: 1024, height: 768 }`. */
  display?: { width: number; height: number }
}

const DEFAULT_DISPLAY = { width: 1024, height: 768 }

/** Every command runs against this X display. */
const X = 'DISPLAY=:0'

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

// ponytail: same chunking and delay as `@e2b/desktop` write. Long xdotool
// type calls drop characters. Lower the delay if typing is too slow.
const TYPE_CHUNK = 25
const TYPE_DELAY_MS = 75

function toXdotoolKey(key: string) {
  return XDOTOOL_KEYS[key] ?? key
}

/** Quote one value for a POSIX shell. The model picks key names and text, so they never reach the shell raw. */
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

function moveTo(x: number, y: number) {
  return `mousemove ${Math.round(x)} ${Math.round(y)}`
}

/**
 * Create a driver for a Linux desktop in a sandbox from `@tanstack/ai-sandbox`.
 *
 * The image must have `xdotool`, `xdpyinfo`, and `scrot` or ImageMagick
 * `import`. When no X display
 * runs on `:0`, the driver starts `Xvfb`, and `startxfce4` when the image has
 * it. The E2B `desktop` template has all of these.
 */
export async function createSandboxComputerDriver({
  sandbox,
  display: size = DEFAULT_DISPLAY,
}: SandboxComputerDriverOptions) {
  async function run(command: string) {
    const result = await sandbox.process.exec(command)
    if (result.exitCode !== 0) {
      throw new Error(
        `Sandbox command failed with exit code ${result.exitCode}: ${command}\n${result.stderr}`,
      )
    }
    return result.stdout
  }
  const xdotool = (args: string) => run(`${X} xdotool ${args}`)

  // Prints each missing tool. `@import` means no scrot, but ImageMagick
  // `import` takes the screenshots, like on Amazon Linux.
  const found = (
    await run(
      'for t in xdotool xdpyinfo; do command -v $t >/dev/null || echo $t; done; command -v scrot >/dev/null || { command -v import >/dev/null && echo @import || echo scrot; }',
    )
  )
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const missing = found.filter((tool) => tool !== '@import')
  if (missing.length > 0) {
    throw new Error(
      `The sandbox has no desktop tools: ${missing.join(', ')}. Use a desktop image, like the E2B "desktop" template.`,
    )
  }
  const capture = found.includes('@import')
    ? 'import -window root'
    : 'scrot --pointer'

  const running = await sandbox.process.exec(`${X} xdpyinfo >/dev/null 2>&1`)
  if (running.exitCode !== 0) {
    // Output goes to /dev/null, so no provider buffer fills up.
    await sandbox.process.spawn(
      `Xvfb :0 -ac -screen 0 ${int(size.width)}x${int(size.height)}x24 -nolisten tcp >/dev/null 2>&1`,
    )
    await run(
      `for i in $(seq 50); do ${X} xdpyinfo >/dev/null 2>&1 && exit 0; sleep 0.2; done; echo 'Xvfb did not start' >&2; exit 1`,
    )
    // ponytail: no wait for the session. Early screenshots can show an empty
    // screen, and the model takes another one.
    await sandbox.process.spawn(
      `command -v startxfce4 >/dev/null && ${X} startxfce4 >/dev/null 2>&1`,
    )
  }

  const info = await run(`${X} xdpyinfo`)
  const match = /dimensions:\s+(\d+)x(\d+)/.exec(info)
  if (!match) {
    throw new Error('Could not read the screen size from xdpyinfo.')
  }

  const driver = {
    display: { width: Number(match[1]), height: Number(match[2]) },
    environment: 'linux',
    async screenshot() {
      const file = `/tmp/${generateId('tanstack-screenshot')}.png`
      // One round trip: capture, print as base64, delete. Not `status`: zsh
      // (the Daytona shell) makes it read-only.
      const base64 = await run(
        `${X} ${capture} ${file} && base64 -w0 ${file}; code=$?; rm -f ${file}; exit $code`,
      )
      return base64ToUint8Array(base64.trim())
    },
    async click(x, y, { button, count }) {
      await xdotool(
        `${moveTo(x, y)} click --repeat ${int(count)} ${BUTTONS[button]}`,
      )
    },
    async move(x, y) {
      await xdotool(moveTo(x, y))
    },
    async mouseDown(button) {
      await xdotool(`mousedown ${BUTTONS[button]}`)
    },
    async mouseUp(button) {
      await xdotool(`mouseup ${BUTTONS[button]}`)
    },
    async scroll(x, y, deltaX, deltaY) {
      // xdotool buttons 4 and 5 scroll up and down, 6 and 7 left and right.
      let args = moveTo(x, y)
      if (deltaY !== 0) {
        args += ` click --repeat ${scrollClicks(deltaY)} ${deltaY > 0 ? 5 : 4}`
      }
      if (deltaX !== 0) {
        args += ` click --repeat ${scrollClicks(deltaX)} ${deltaX > 0 ? 7 : 6}`
      }
      await xdotool(args)
    },
    async keyDown(key) {
      await xdotool(`keydown -- ${quote(toXdotoolKey(key))}`)
    },
    async keyUp(key) {
      await xdotool(`keyup -- ${quote(toXdotoolKey(key))}`)
    },
    async press(keys) {
      await xdotool(`key -- ${quote(keys.map(toXdotoolKey).join('+'))}`)
    },
    async type(text) {
      if (text === '') return
      const chunks: Array<string> = []
      for (let i = 0; i < text.length; i += TYPE_CHUNK) {
        chunks.push(text.slice(i, i + TYPE_CHUNK))
      }
      await run(
        chunks
          .map(
            (chunk) =>
              `${X} xdotool type --delay ${TYPE_DELAY_MS} -- ${quote(chunk)}`,
          )
          .join(' && '),
      )
    },
    async cursorPosition() {
      const out = await xdotool('getmouselocation')
      const position = /x:(\d+)\s+y:(\d+)/.exec(out)
      if (!position) {
        throw new Error(`Could not read the cursor position: ${out}`)
      }
      return { x: Number(position[1]), y: Number(position[2]) }
    },
  } satisfies ComputerDriver
  return driver
}

/**
 * Create a driver factory that creates one sandbox for each thread.
 *
 * Each sandbox comes from `provider.create`. When `createComputerUse` closes
 * a thread, or the thread goes idle, the sandbox of that thread is
 * destroyed. The drivers have `cursorPosition`. They have no `zoom` and no
 * `navigate`, because a desktop has no address. The model opens the browser
 * on the desktop.
 *
 * @example
 * const computer = createComputerUse({
 *   driver: sandboxComputer({
 *     provider: e2bSandbox({ template: 'desktop' }),
 *   }),
 * })
 */
export function sandboxComputer({
  provider,
  display = DEFAULT_DISPLAY,
}: SandboxComputerOptions) {
  const factory: ComputerDriverFactory = {
    display,
    environment: 'linux',
    capabilities: { zoom: false, cursorPosition: true, navigate: false },
    async create() {
      const sandbox = await provider.create({})
      try {
        const driver = await createSandboxComputerDriver({ sandbox, display })
        const { width, height } = driver.display
        if (width !== display.width || height !== display.height) {
          throw new Error(
            `The sandbox display is ${width}x${height}, not ${display.width}x${display.height}. Set display to the size of the running display.`,
          )
        }
        return { ...driver, close: () => sandbox.destroy() }
      } catch (error) {
        // Keep the setup error. A failed destroy does not replace it.
        await sandbox.destroy().catch((destroyError: unknown) => {
          console.error(
            'Failed to destroy the sandbox after setup failed.',
            destroyError,
          )
        })
        throw error
      }
    },
  }
  return factory
}
