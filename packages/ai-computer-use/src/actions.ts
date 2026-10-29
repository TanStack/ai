import { parseKeyCombo, toCombo, toKey } from './keys'
import type { ComputerDriver, MouseButton } from './types'

/** One Anthropic `scroll_amount` step, in pixels. */
const SCROLL_STEP = 100

// ponytail: an OpenAI `wait` has no duration. 2 s is the wait in the OpenAI samples.
const OPENAI_WAIT_MS = 2000

// The Anthropic computer tool docs give these limits: `repeat` is 1 to 100, and a
// `hold_key` or `wait` duration is up to 300 seconds. Reject here, before any key goes down.
const MAX_KEY_REPEAT = 100
const MAX_WAIT_SECONDS = 300

type Point = { x: number; y: number }
type Input = Record<string, unknown>

function isRecord(value: unknown): value is Input {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

function invalid(key: string, expected: string) {
  return new Error(`Invalid computer action: "${key}" must be ${expected}.`)
}

function readNumber(input: Input, key: string) {
  const value = input[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw invalid(key, 'a number')
  }
  return value
}

function readString(input: Input, key: string) {
  const value = input[key]
  if (typeof value !== 'string') throw invalid(key, 'a string')
  return value
}

function readOptionalString(input: Input, key: string) {
  const value = input[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw invalid(key, 'a string')
  return value
}

function readNumbers(input: Input, key: string, length: number) {
  const value = input[key]
  const isValid =
    Array.isArray(value) &&
    value.length === length &&
    value.every((item) => typeof item === 'number' && Number.isFinite(item))
  if (!isValid) throw invalid(key, `an array of ${length} numbers`)
  return value.filter((item) => typeof item === 'number')
}

function readCoordinate(input: Input, key: string) {
  const [x = 0, y = 0] = readNumbers(input, key, 2)
  return { x, y }
}

function readRepeat(input: Input) {
  if (input['repeat'] === undefined || input['repeat'] === null) return 1
  const repeat = readNumber(input, 'repeat')
  if (!Number.isInteger(repeat) || repeat < 1 || repeat > MAX_KEY_REPEAT) {
    throw invalid('repeat', `an integer from 1 to ${MAX_KEY_REPEAT}`)
  }
  return repeat
}

function readSeconds(input: Input, key: string) {
  const value = readNumber(input, key)
  if (value < 0 || value > MAX_WAIT_SECONDS) {
    throw invalid(key, `a number from 0 to ${MAX_WAIT_SECONDS}`)
  }
  return value
}

/** Presses `keys` in order, runs `action`, then releases the keys that went down. */
async function withKeys(
  driver: ComputerDriver,
  keys: Array<string>,
  action: () => Promise<void>,
) {
  const pressed: Array<string> = []
  let releaseError: unknown
  try {
    for (const key of keys) {
      await driver.keyDown(key)
      pressed.push(key)
    }
    await action()
  } finally {
    // One failed keyUp does not stop the rest.
    for (const key of pressed.reverse()) {
      await driver.keyUp(key).catch((error: unknown) => {
        releaseError ??= error
      })
    }
  }
  // Reached only when the action succeeded, so an action error wins.
  if (releaseError !== undefined) throw releaseError
}

async function drag(driver: ComputerDriver, path: Array<Point>) {
  const [start, ...rest] = path
  if (start === undefined) throw invalid('path', 'a non-empty array')
  await driver.move(start.x, start.y)
  await driver.mouseDown('left')
  try {
    for (const point of rest) await driver.move(point.x, point.y)
  } finally {
    await driver.mouseUp('left')
  }
}

// ---------------------------------------------------------------------------
// Anthropic: `{ action: 'left_click', coordinate: [x, y], ... }`
// ---------------------------------------------------------------------------

const ANTHROPIC_CLICKS: Record<string, { button: MouseButton; count: number }> =
  {
    left_click: { button: 'left', count: 1 },
    right_click: { button: 'right', count: 1 },
    middle_click: { button: 'middle', count: 1 },
    double_click: { button: 'left', count: 2 },
    triple_click: { button: 'left', count: 3 },
  }

/** The `coordinate` of the action, or the mouse position when it has none. */
async function anthropicPoint(driver: ComputerDriver, input: Input) {
  if (input['coordinate'] !== undefined && input['coordinate'] !== null) {
    return readCoordinate(input, 'coordinate')
  }
  if (!driver.cursorPosition) {
    throw new Error(
      'Invalid computer action: "coordinate" is missing, and the computer driver has no cursorPosition method.',
    )
  }
  return driver.cursorPosition()
}

function anthropicModifiers(input: Input) {
  const text = readOptionalString(input, 'text')
  return text ? parseKeyCombo(text) : []
}

function scrollDelta(direction: string, pixels: number) {
  switch (direction) {
    case 'up':
      return { deltaX: 0, deltaY: -pixels }
    case 'down':
      return { deltaX: 0, deltaY: pixels }
    case 'left':
      return { deltaX: -pixels, deltaY: 0 }
    case 'right':
      return { deltaX: pixels, deltaY: 0 }
    default:
      throw invalid('scroll_direction', '"up", "down", "left", or "right"')
  }
}

async function runAnthropicAction(
  driver: ComputerDriver,
  action: string,
  input: Input,
) {
  const click = ANTHROPIC_CLICKS[action]
  if (click) {
    const { x, y } = await anthropicPoint(driver, input)
    await withKeys(driver, anthropicModifiers(input), () =>
      driver.click(x, y, click),
    )
    return undefined
  }

  switch (action) {
    case 'screenshot':
      return undefined
    case 'key': {
      const combos = readString(input, 'text').split(/\s+/).filter(Boolean)
      const repeat = readRepeat(input)
      for (let i = 0; i < repeat; i++) {
        for (const combo of combos) await driver.press(parseKeyCombo(combo))
      }
      return undefined
    }
    case 'type':
      await driver.type(readString(input, 'text'))
      return undefined
    case 'mouse_move': {
      const { x, y } = readCoordinate(input, 'coordinate')
      await driver.move(x, y)
      return undefined
    }
    case 'left_click_drag': {
      const path = [
        readCoordinate(input, 'start_coordinate'),
        readCoordinate(input, 'coordinate'),
      ]
      await withKeys(driver, anthropicModifiers(input), () =>
        drag(driver, path),
      )
      return undefined
    }
    case 'left_mouse_down':
      await driver.mouseDown('left')
      return undefined
    case 'left_mouse_up':
      await driver.mouseUp('left')
      return undefined
    case 'scroll': {
      const { x, y } = await anthropicPoint(driver, input)
      const pixels = readNumber(input, 'scroll_amount') * SCROLL_STEP
      const direction = readString(input, 'scroll_direction')
      const { deltaX, deltaY } = scrollDelta(direction, pixels)
      await withKeys(driver, anthropicModifiers(input), () =>
        driver.scroll(x, y, deltaX, deltaY),
      )
      return undefined
    }
    case 'hold_key': {
      const keys = parseKeyCombo(readString(input, 'text'))
      const ms = readSeconds(input, 'duration') * 1000
      await withKeys(driver, keys, () => sleep(ms))
      return undefined
    }
    case 'wait':
      await sleep(readSeconds(input, 'duration') * 1000)
      return undefined
    case 'cursor_position': {
      if (!driver.cursorPosition) {
        throw new Error(
          'The computer driver has no cursorPosition method, so the "cursor_position" action is not available.',
        )
      }
      const { x, y } = await driver.cursorPosition()
      return { type: 'text' as const, text: `X=${x},Y=${y}` }
    }
    case 'zoom': {
      if (!driver.zoom) {
        throw new Error(
          'The computer driver has no zoom method, so the "zoom" action is not available.',
        )
      }
      const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = readNumbers(input, 'region', 4)
      const bytes = await driver.zoom({
        x: x0,
        y: y0,
        width: x1 - x0,
        height: y1 - y0,
      })
      return { type: 'image' as const, bytes }
    }
    default:
      throw new Error(`Unknown computer action "${action}".`)
  }
}

// ---------------------------------------------------------------------------
// OpenAI: `{ action: { type: 'click', ... } }` or `{ actions: [...] }`
// ---------------------------------------------------------------------------

const OPENAI_BUTTONS: Record<string, MouseButton> = {
  left: 'left',
  right: 'right',
  wheel: 'middle',
  back: 'back',
  forward: 'forward',
}

function openaiModifiers(input: Input) {
  const keys = input['keys']
  if (keys === undefined || keys === null) return []
  const isValid =
    Array.isArray(keys) && keys.every((key) => typeof key === 'string')
  if (!isValid) throw invalid('keys', 'an array of strings')
  return keys.filter((key) => typeof key === 'string').map(toKey)
}

function readPath(input: Input) {
  const path = input['path']
  if (!Array.isArray(path)) throw invalid('path', 'an array of points')
  return path.map((point) => {
    if (!isRecord(point)) throw invalid('path', 'an array of points')
    return { x: readNumber(point, 'x'), y: readNumber(point, 'y') }
  })
}

async function runOpenAIAction(driver: ComputerDriver, input: unknown) {
  if (!isRecord(input)) throw invalid('action', 'an object')
  const type = readString(input, 'type')
  const modifiers = openaiModifiers(input)

  switch (type) {
    case 'screenshot':
      return
    case 'click': {
      const button = OPENAI_BUTTONS[readString(input, 'button')]
      if (!button) {
        throw invalid(
          'button',
          '"left", "right", "wheel", "back", or "forward"',
        )
      }
      const x = readNumber(input, 'x')
      const y = readNumber(input, 'y')
      await withKeys(driver, modifiers, () =>
        driver.click(x, y, { button, count: 1 }),
      )
      return
    }
    case 'double_click': {
      const x = readNumber(input, 'x')
      const y = readNumber(input, 'y')
      await withKeys(driver, modifiers, () =>
        driver.click(x, y, { button: 'left', count: 2 }),
      )
      return
    }
    case 'drag': {
      const path = readPath(input)
      await withKeys(driver, modifiers, () => drag(driver, path))
      return
    }
    case 'keypress': {
      const keys = input['keys']
      const isValid =
        Array.isArray(keys) &&
        keys.length > 0 &&
        keys.every((key) => typeof key === 'string')
      if (!isValid) throw invalid('keys', 'a non-empty array of strings')
      await driver.press(toCombo(keys.filter((key) => typeof key === 'string')))
      return
    }
    case 'move': {
      const x = readNumber(input, 'x')
      const y = readNumber(input, 'y')
      await withKeys(driver, modifiers, () => driver.move(x, y))
      return
    }
    case 'scroll': {
      const x = readNumber(input, 'x')
      const y = readNumber(input, 'y')
      const deltaX = readNumber(input, 'scroll_x')
      const deltaY = readNumber(input, 'scroll_y')
      await withKeys(driver, modifiers, () =>
        driver.scroll(x, y, deltaX, deltaY),
      )
      return
    }
    case 'type':
      await driver.type(readString(input, 'text'))
      return
    case 'wait':
      await sleep(OPENAI_WAIT_MS)
      return
    default:
      throw new Error(`Unknown computer action "${type}".`)
  }
}

/**
 * Runs one computer tool call from the model on a driver.
 *
 * The input shape picks the provider:
 * - A string `action` is an Anthropic action.
 * - An object `action` or an `actions` array is an OpenAI call. A batch runs
 *   in order.
 *
 * The result is `undefined` when the action has no output of its own. Then
 * the caller takes a screenshot. `zoom` gives `{ type: 'image', bytes }` and
 * `cursor_position` gives `{ type: 'text', text }`.
 *
 * Throws an `Error` for an input that is not valid, an unknown action, or a
 * `zoom` or `cursor_position` action when the driver has no such method.
 *
 * @param driver - The driver that controls the computer.
 * @param input - The raw tool input from the model.
 */
export async function runComputerAction(
  driver: ComputerDriver,
  input: unknown,
) {
  if (!isRecord(input)) throw invalid('input', 'an object')
  const { action, actions } = input
  if (typeof action === 'string') {
    return runAnthropicAction(driver, action, input)
  }
  if (Array.isArray(actions)) {
    for (const item of actions) await runOpenAIAction(driver, item)
    return undefined
  }
  if (isRecord(action)) {
    await runOpenAIAction(driver, action)
    return undefined
  }
  throw invalid('action', 'a string, an object, or an "actions" array')
}
