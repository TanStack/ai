import { afterEach, describe, expect, it, vi } from 'vitest'
import { runComputerAction } from '../src/actions'
import type { ComputerDriver } from '../src/types'

type Call = [string, ...Array<unknown>]

const ZOOM_BYTES = new Uint8Array([1, 2, 3])

/** A driver that records every call in order. */
function createDriver(options: { zoom?: boolean; cursor?: boolean } = {}) {
  const calls: Array<Call> = []
  const record =
    (name: string) =>
    async (...args: Array<unknown>) => {
      calls.push([name, ...args])
    }
  const driver: ComputerDriver = {
    display: { width: 1024, height: 768 },
    environment: 'browser',
    screenshot: async () => new Uint8Array(),
    click: record('click'),
    move: record('move'),
    mouseDown: record('mouseDown'),
    mouseUp: record('mouseUp'),
    scroll: record('scroll'),
    keyDown: record('keyDown'),
    keyUp: record('keyUp'),
    press: record('press'),
    type: record('type'),
  }
  if (options.zoom) {
    driver.zoom = async (region) => {
      calls.push(['zoom', region])
      return ZOOM_BYTES
    }
  }
  if (options.cursor) {
    driver.cursorPosition = async () => ({ x: 7, y: 9 })
  }
  return { driver, calls }
}

async function run(
  input: unknown,
  options?: { zoom?: boolean; cursor?: boolean },
) {
  const { driver, calls } = createDriver(options)
  const result = await runComputerAction(driver, input)
  return { result, calls }
}

/** Checks that the action ends after `ms` and not before. */
async function expectToFinishAfter(input: unknown, ms: number) {
  vi.useFakeTimers()
  const { driver } = createDriver()
  let finished = false
  void runComputerAction(driver, input).then(() => {
    finished = true
  })
  await vi.advanceTimersByTimeAsync(ms - 1)
  expect(finished).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  expect(finished).toBe(true)
}

afterEach(() => {
  vi.useRealTimers()
})

describe('Anthropic actions', () => {
  it('needs no driver call for a screenshot', async () => {
    expect(await run({ action: 'screenshot' })).toEqual({
      result: undefined,
      calls: [],
    })
  })

  it('presses each combo in a key action', async () => {
    const { calls } = await run({ action: 'key', text: 'ctrl+s Return' })
    expect(calls).toEqual([
      ['press', ['Control', 's']],
      ['press', ['Enter']],
    ])
  })

  it('repeats a key action', async () => {
    const { calls } = await run({ action: 'key', text: 'Down', repeat: 2 })
    expect(calls).toEqual([
      ['press', ['ArrowDown']],
      ['press', ['ArrowDown']],
    ])
  })

  it('types text', async () => {
    const { calls } = await run({ action: 'type', text: 'hello' })
    expect(calls).toEqual([['type', 'hello']])
  })

  it('moves the mouse', async () => {
    const { calls } = await run({ action: 'mouse_move', coordinate: [3, 4] })
    expect(calls).toEqual([['move', 3, 4]])
  })

  it.each([
    ['left_click', 'left', 1],
    ['right_click', 'right', 1],
    ['middle_click', 'middle', 1],
    ['double_click', 'left', 2],
    ['triple_click', 'left', 3],
  ])('runs %s as a %s click with count %i', async (action, button, count) => {
    const { calls } = await run({ action, coordinate: [10, 20] })
    expect(calls).toEqual([['click', 10, 20, { button, count }]])
  })

  it('holds the modifiers around a click and releases them in reverse', async () => {
    const { calls } = await run({
      action: 'left_click',
      coordinate: [10, 20],
      text: 'ctrl+shift',
    })
    expect(calls).toEqual([
      ['keyDown', 'Control'],
      ['keyDown', 'Shift'],
      ['click', 10, 20, { button: 'left', count: 1 }],
      ['keyUp', 'Shift'],
      ['keyUp', 'Control'],
    ])
  })

  it('releases the keys that went down when a later keyDown throws', async () => {
    const { driver, calls } = createDriver()
    driver.keyDown = async (key) => {
      calls.push(['keyDown', key])
      if (key === 'Shift') throw new Error('key down failed')
    }
    await expect(
      runComputerAction(driver, {
        action: 'left_click',
        coordinate: [1, 2],
        text: 'ctrl+shift',
      }),
    ).rejects.toThrow('key down failed')
    expect(calls).toEqual([
      ['keyDown', 'Control'],
      ['keyDown', 'Shift'],
      ['keyUp', 'Control'],
    ])
  })

  it('releases the remaining keys when one keyUp throws', async () => {
    const { driver, calls } = createDriver()
    driver.keyUp = async (key) => {
      calls.push(['keyUp', key])
      if (key === 'Shift') throw new Error('key up failed')
    }
    await expect(
      runComputerAction(driver, {
        action: 'left_click',
        coordinate: [1, 2],
        text: 'ctrl+shift',
      }),
    ).rejects.toThrow('key up failed')
    expect(calls).toEqual([
      ['keyDown', 'Control'],
      ['keyDown', 'Shift'],
      ['click', 1, 2, { button: 'left', count: 1 }],
      ['keyUp', 'Shift'],
      ['keyUp', 'Control'],
    ])
  })

  it('clicks at the mouse position when the click has no coordinate', async () => {
    const { calls } = await run({ action: 'left_click' }, { cursor: true })
    expect(calls).toEqual([['click', 7, 9, { button: 'left', count: 1 }]])
  })

  it('throws for a click with no coordinate when the driver has no cursorPosition', async () => {
    await expect(run({ action: 'left_click' })).rejects.toThrow(
      '"coordinate" is missing',
    )
  })

  it('releases the drag button when a later move throws', async () => {
    const { driver, calls } = createDriver()
    let moves = 0
    driver.move = async (x, y) => {
      calls.push(['move', x, y])
      moves += 1
      if (moves === 2) throw new Error('move failed')
    }
    await expect(
      runComputerAction(driver, {
        action: 'left_click_drag',
        start_coordinate: [1, 2],
        coordinate: [3, 4],
      }),
    ).rejects.toThrow('move failed')
    expect(calls).toEqual([
      ['move', 1, 2],
      ['mouseDown', 'left'],
      ['move', 3, 4],
      ['mouseUp', 'left'],
    ])
  })

  it('rejects a key repeat outside 1 to 100 before it presses', async () => {
    const { driver, calls } = createDriver()
    await expect(
      runComputerAction(driver, { action: 'key', text: 'a', repeat: 101 }),
    ).rejects.toThrow('"repeat"')
    await expect(
      runComputerAction(driver, { action: 'key', text: 'a', repeat: 1.5 }),
    ).rejects.toThrow('"repeat"')
    expect(calls).toEqual([])
  })

  it('rejects a hold or a wait longer than 300 seconds', async () => {
    const { driver, calls } = createDriver()
    await expect(
      runComputerAction(driver, {
        action: 'hold_key',
        text: 'shift',
        duration: 301,
      }),
    ).rejects.toThrow('"duration"')
    await expect(
      runComputerAction(driver, { action: 'wait', duration: 301 }),
    ).rejects.toThrow('"duration"')
    expect(calls).toEqual([])
  })

  it('drags from the start to the end coordinate', async () => {
    const { calls } = await run({
      action: 'left_click_drag',
      start_coordinate: [1, 2],
      coordinate: [30, 40],
    })
    expect(calls).toEqual([
      ['move', 1, 2],
      ['mouseDown', 'left'],
      ['move', 30, 40],
      ['mouseUp', 'left'],
    ])
  })

  it('presses and releases the left button', async () => {
    const down = await run({ action: 'left_mouse_down' })
    const up = await run({ action: 'left_mouse_up' })
    expect([...down.calls, ...up.calls]).toEqual([
      ['mouseDown', 'left'],
      ['mouseUp', 'left'],
    ])
  })

  it.each([
    ['up', 0, -300],
    ['down', 0, 300],
    ['left', -300, 0],
    ['right', 300, 0],
  ])('scrolls %s in 100 px steps', async (direction, deltaX, deltaY) => {
    const { calls } = await run({
      action: 'scroll',
      coordinate: [50, 60],
      scroll_direction: direction,
      scroll_amount: 3,
    })
    expect(calls).toEqual([['scroll', 50, 60, deltaX, deltaY]])
  })

  it('holds a modifier while it scrolls', async () => {
    const { calls } = await run({
      action: 'scroll',
      coordinate: [50, 60],
      scroll_direction: 'down',
      scroll_amount: 1,
      text: 'shift',
    })
    expect(calls).toEqual([
      ['keyDown', 'Shift'],
      ['scroll', 50, 60, 0, 100],
      ['keyUp', 'Shift'],
    ])
  })

  it('throws for an unknown scroll direction', async () => {
    await expect(
      run({
        action: 'scroll',
        coordinate: [1, 1],
        scroll_direction: 'sideways',
        scroll_amount: 1,
      }),
    ).rejects.toThrow('"scroll_direction"')
  })

  it('holds a key for the duration, then releases it', async () => {
    vi.useFakeTimers()
    const { driver, calls } = createDriver()
    const done = runComputerAction(driver, {
      action: 'hold_key',
      text: 'shift',
      duration: 2,
    })
    await vi.advanceTimersByTimeAsync(1999)
    expect(calls).toEqual([['keyDown', 'Shift']])
    await vi.advanceTimersByTimeAsync(1)
    await done
    expect(calls).toEqual([
      ['keyDown', 'Shift'],
      ['keyUp', 'Shift'],
    ])
  })

  it('waits for the duration in seconds', async () => {
    await expectToFinishAfter({ action: 'wait', duration: 1.5 }, 1500)
  })

  it('returns the zoom image for the region', async () => {
    const { result, calls } = await run(
      { action: 'zoom', region: [10, 20, 110, 70] },
      { zoom: true },
    )
    expect(result).toEqual({ type: 'image', bytes: ZOOM_BYTES })
    expect(calls).toEqual([['zoom', { x: 10, y: 20, width: 100, height: 50 }]])
  })

  it('throws for zoom when the driver has no zoom method', async () => {
    await expect(run({ action: 'zoom', region: [0, 0, 1, 1] })).rejects.toThrow(
      'no zoom method',
    )
  })

  it('returns the cursor position as text', async () => {
    const { result } = await run(
      { action: 'cursor_position' },
      { cursor: true },
    )
    expect(result).toEqual({ type: 'text', text: 'X=7,Y=9' })
  })

  it('throws for cursor_position when the driver has no cursorPosition method', async () => {
    await expect(run({ action: 'cursor_position' })).rejects.toThrow(
      'no cursorPosition method',
    )
  })

  it('throws for an unknown action', async () => {
    await expect(run({ action: 'fly' })).rejects.toThrow(
      'Unknown computer action "fly"',
    )
  })

  it('throws for a missing field', async () => {
    await expect(run({ action: 'type' })).rejects.toThrow(
      '"text" must be a string',
    )
  })
})

describe('OpenAI actions', () => {
  it.each([
    ['left', 'left'],
    ['right', 'right'],
    ['wheel', 'middle'],
    ['back', 'back'],
    ['forward', 'forward'],
  ])('clicks the %s button as %s', async (button, driverButton) => {
    const { calls } = await run({
      action: { type: 'click', button, x: 5, y: 6 },
    })
    expect(calls).toEqual([['click', 5, 6, { button: driverButton, count: 1 }]])
  })

  it('holds the keys around a click and releases them in reverse', async () => {
    const { calls } = await run({
      action: {
        type: 'click',
        button: 'left',
        x: 5,
        y: 6,
        keys: ['CTRL', 'shift'],
      },
    })
    expect(calls).toEqual([
      ['keyDown', 'Control'],
      ['keyDown', 'Shift'],
      ['click', 5, 6, { button: 'left', count: 1 }],
      ['keyUp', 'Shift'],
      ['keyUp', 'Control'],
    ])
  })

  it('throws for an unknown button', async () => {
    await expect(
      run({ action: { type: 'click', button: 'thumb', x: 1, y: 1 } }),
    ).rejects.toThrow('"button"')
  })

  it('double-clicks', async () => {
    const { calls } = await run({
      action: { type: 'double_click', x: 5, y: 6, keys: null },
    })
    expect(calls).toEqual([['click', 5, 6, { button: 'left', count: 2 }]])
  })

  it('drags along every point of the path', async () => {
    const { calls } = await run({
      action: {
        type: 'drag',
        path: [
          { x: 1, y: 1 },
          { x: 2, y: 2 },
          { x: 3, y: 3 },
        ],
      },
    })
    expect(calls).toEqual([
      ['move', 1, 1],
      ['mouseDown', 'left'],
      ['move', 2, 2],
      ['move', 3, 3],
      ['mouseUp', 'left'],
    ])
  })

  it('drags with a one-point path', async () => {
    const { calls } = await run({
      action: { type: 'drag', path: [{ x: 4, y: 4 }] },
    })
    expect(calls).toEqual([
      ['move', 4, 4],
      ['mouseDown', 'left'],
      ['mouseUp', 'left'],
    ])
  })

  it('throws for a drag with an empty path', async () => {
    await expect(run({ action: { type: 'drag', path: [] } })).rejects.toThrow(
      '"path"',
    )
  })

  it('presses a keypress combo', async () => {
    const { calls } = await run({
      action: { type: 'keypress', keys: ['CTRL', 'S'] },
    })
    expect(calls).toEqual([['press', ['Control', 's']]])
  })

  it('moves the mouse', async () => {
    const { calls } = await run({ action: { type: 'move', x: 8, y: 9 } })
    expect(calls).toEqual([['move', 8, 9]])
  })

  it('scrolls by the pixel deltas', async () => {
    const { calls } = await run({
      action: { type: 'scroll', x: 10, y: 20, scroll_x: -15, scroll_y: 250 },
    })
    expect(calls).toEqual([['scroll', 10, 20, -15, 250]])
  })

  it('types text', async () => {
    const { calls } = await run({ action: { type: 'type', text: 'hi' } })
    expect(calls).toEqual([['type', 'hi']])
  })

  it('waits 2 seconds', async () => {
    await expectToFinishAfter({ action: { type: 'wait' } }, 2000)
  })

  it('needs no driver call for a screenshot', async () => {
    expect(await run({ action: { type: 'screenshot' } })).toEqual({
      result: undefined,
      calls: [],
    })
  })

  it('runs an actions batch in order', async () => {
    const { result, calls } = await run({
      actions: [
        { type: 'click', button: 'left', x: 1, y: 2 },
        { type: 'type', text: 'abc' },
        { type: 'keypress', keys: ['ENTER'] },
      ],
      pending_safety_checks: [],
    })
    expect(result).toBeUndefined()
    expect(calls).toEqual([
      ['click', 1, 2, { button: 'left', count: 1 }],
      ['type', 'abc'],
      ['press', ['Enter']],
    ])
  })

  it('throws for an unknown action type', async () => {
    await expect(run({ action: { type: 'fly' } })).rejects.toThrow(
      'Unknown computer action "fly"',
    )
  })
})

it('throws for an input with no action', async () => {
  await expect(run({ foo: 1 })).rejects.toThrow('"action"')
})
