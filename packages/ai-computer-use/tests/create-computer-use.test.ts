import { afterEach, describe, expect, it, vi } from 'vitest'
import { CapabilityRegistry } from '@tanstack/ai'
import { createComputerUse } from '../src/create-computer-use'
import { computerSafetyCheck } from '../src/safety-check'
import type {
  ChatMiddlewareContext,
  GenericInterruptResolution,
  InterruptResolutionCollection,
  ModelMessage,
} from '@tanstack/ai'
import type { ComputerDriver, ComputerDriverFactory } from '../src/types'

const PNG_BYTES = new Uint8Array([137, 80, 78, 71])
const PNG_BASE64 = 'iVBORw=='
const ZOOM_BYTES = new Uint8Array([1, 2, 3])
const ZOOM_BASE64 = 'AQID'

const THREAD = 'thread'
const CLICK = { action: { type: 'click', x: 10, y: 20, button: 'left' } }
const TYPE = { action: { type: 'type', text: 'hi' } }
const CHECK = { id: 'sc_1', code: 'malicious_instructions', message: 'Look.' }
const CHECKED_CLICK = { ...CLICK, pending_safety_checks: [CHECK] }
const NOT_EXECUTED =
  'Not executed: an earlier computer action in this turn failed.'
const FULL_URL = 'a full URL that starts with https:// or http://'

function screenshotOf(base64: string) {
  return [
    {
      type: 'image',
      source: { type: 'data', value: base64, mimeType: 'image/png' },
    },
  ]
}

/** A gate that holds an action until the test opens it. */
function createGate() {
  let open = () => {}
  const gate = new Promise<void>((resolve) => {
    open = resolve
  })
  return { gate, open }
}

interface DriverOptions {
  zoom?: boolean
  cursor?: boolean
  navigate?: boolean
  /** `click` throws while this returns true. */
  failClick?: () => boolean
  /** `click` waits for this promise. */
  clickGate?: Promise<void>
  /** The bytes that `screenshot` returns. The default is `PNG_BYTES`. */
  screenshot?: Uint8Array
}

/** A driver that records its calls in order. */
function createDriver(options: DriverOptions = {}) {
  const calls: Array<string> = []
  const record = (name: string) => async () => {
    calls.push(name)
  }
  const driver: ComputerDriver = {
    display: { width: 1024, height: 768 },
    environment: 'browser',
    screenshot: async () => {
      calls.push('screenshot')
      return options.screenshot ?? PNG_BYTES
    },
    click: async () => {
      calls.push('click:start')
      await options.clickGate
      if (options.failClick?.()) throw new Error('click failed')
      calls.push('click:end')
    },
    move: record('move'),
    mouseDown: record('mouseDown'),
    mouseUp: record('mouseUp'),
    scroll: record('scroll'),
    keyDown: record('keyDown'),
    keyUp: record('keyUp'),
    press: record('press'),
    type: record('type'),
    close: record('close'),
  }
  if (options.zoom) driver.zoom = async () => ZOOM_BYTES
  if (options.cursor) driver.cursorPosition = async () => ({ x: 7, y: 9 })
  if (options.navigate) {
    driver.navigate = async (url) => {
      calls.push(`navigate:${url}`)
    }
  }
  return { driver, calls }
}

interface FactoryOptions extends DriverOptions {
  /** `create` throws while this returns true. */
  failCreate?: () => boolean
  /** `close` throws while this returns true. */
  failClose?: () => boolean
}

/** A factory that records each created machine and each close. */
function createFactory(options: FactoryOptions = {}) {
  const created: Array<string> = []
  const closed: Array<string> = []
  const machines = new Map<string, Array<string>>()
  const factory: ComputerDriverFactory = {
    display: { width: 1280, height: 800 },
    environment: 'linux',
    capabilities: {
      zoom: options.zoom ?? false,
      cursorPosition: options.cursor ?? false,
      navigate: options.navigate ?? false,
    },
    async create({ threadId }) {
      created.push(threadId)
      if (options.failCreate?.()) throw new Error('create failed')
      const { driver, calls } = createDriver(options)
      driver.close = async () => {
        closed.push(threadId)
        if (options.failClose?.()) throw new Error('close failed')
      }
      machines.set(threadId, calls)
      return driver
    },
    async close() {
      closed.push('factory')
    },
  }
  return { factory, created, closed, machines }
}

interface SetupOptions {
  screenshotDelay?: number
  idleTimeout?: number | false
}

/** `createComputerUse`, plus helpers that call its tools as `chat()` does. */
function setupWith(
  driver: ComputerDriver | ComputerDriverFactory,
  options: SetupOptions = {},
) {
  const computer = createComputerUse({
    driver,
    screenshotDelay: options.screenshotDelay ?? 0,
    idleTimeout: options.idleTimeout,
  })
  const [computerTool, navigateTool] = computer.tools
  const execute = (
    input: unknown,
    toolCallId = 'call_1',
    threadId = THREAD,
  ) => {
    if (!computerTool.execute) throw new Error('The tool has no execute.')
    return computerTool.execute(input, {
      toolCallId,
      threadId,
      emitCustomEvent() {},
    })
  }
  const navigate = (url: string, threadId = THREAD) => {
    if (!navigateTool?.execute) throw new Error('There is no navigate tool.')
    return navigateTool.execute(
      { url },
      { toolCallId: 'call_nav', threadId, emitCustomEvent() {} },
    )
  }
  return { ...computer, execute, navigate }
}

function setup(options: DriverOptions & SetupOptions = {}) {
  const { driver, calls } = createDriver(options)
  return { ...setupWith(driver, options), calls }
}

type Computer = ReturnType<typeof createComputerUse>

function createContext(
  phase: ChatMiddlewareContext['phase'],
  messages: Array<ModelMessage> = [],
  threadId = THREAD,
): ChatMiddlewareContext {
  return {
    requestId: 'request',
    streamId: 'stream',
    runId: 'run',
    threadId,
    phase,
    iteration: 0,
    chunkIndex: 0,
    abort() {},
    retry() {},
    emitCustomEvent() {},
    context: undefined,
    defer() {},
    activity: 'chat',
    provider: 'openai',
    model: 'gpt-6.1-sol',
    source: 'server',
    streaming: true,
    systemPrompts: [],
    messageCount: messages.length,
    hasTools: true,
    currentMessageId: null,
    accumulatedContent: '',
    messages,
    createId: (prefix) => prefix,
    capabilities: new CapabilityRegistry(),
    get: () => {
      throw new Error('unused')
    },
    getOptional: () => undefined,
    provide() {},
  }
}

function toolCall(id: string, input: unknown, name = 'computer') {
  return {
    id,
    type: 'function' as const,
    function: { name, arguments: JSON.stringify(input) },
  }
}

/** Run the boundary hook at `beforeTools` with one assistant tool-call message. */
function boundary(
  computer: Computer,
  toolCalls: Array<ReturnType<typeof toolCall>>,
  threadId = THREAD,
) {
  const messages: Array<ModelMessage> = [
    { role: 'user', content: 'Click the button.' },
    { role: 'assistant', content: null, toolCalls },
  ]
  return computer.middleware.onInterruptBoundary?.({
    ...createContext('beforeTools', messages, threadId),
    phase: 'beforeTools',
  })
}

function beforeModel(computer: Computer, threadId = THREAD) {
  return computer.middleware.onConfig?.(
    createContext('beforeModel', [], threadId),
    { messages: [], systemPrompts: [], tools: [] },
  )
}

type Resolution = GenericInterruptResolution<typeof computerSafetyCheck>

function safetyRequest(key: string) {
  return computerSafetyCheck.interrupt({
    key,
    reason: 'computer-safety-check',
    message: 'Look.',
    payload: { checks: [CHECK], action: CLICK.action },
  })
}

function answer(key: string, approved: boolean): Resolution {
  return {
    request: safetyRequest(key),
    status: 'resolved',
    response: { approved },
  }
}

function cancelled(key: string): Resolution {
  return { request: safetyRequest(key), status: 'cancelled' }
}

function resolve(
  computer: Computer,
  items: Array<Resolution>,
  threadId = THREAD,
) {
  const collection: InterruptResolutionCollection<typeof computerSafetyCheck> =
    {
      // TypeScript cannot tie a generic return to one definition. The chat
      // engine uses the same cast.
      for: () => items as never,
      all: () => items,
    }
  return computer.middleware.onInterruptResolution?.(
    createContext('init', [], threadId),
    collection,
  )
}

/** Wait for a macrotask, so that every pending promise step runs. */
function settle() {
  return new Promise((done) => setTimeout(done, 0))
}

afterEach(() => {
  vi.useRealTimers()
})

describe('createComputerUse tool', () => {
  it('is the computer tool with the driver metadata', () => {
    const {
      tools: [tool],
      interrupt,
    } = setup({ zoom: true })

    expect(tool.name).toBe('computer')
    expect(tool.metadata).toEqual({
      __kind: 'computer_use',
      display: { width: 1024, height: 768 },
      environment: 'browser',
      capabilities: { zoom: true, cursorPosition: false },
    })
    expect(interrupt).toBe(computerSafetyCheck)
  })

  it('gives the cursorPosition capability from the driver', () => {
    const {
      tools: [tool],
    } = setup({ cursor: true })

    expect(tool.metadata?.capabilities).toEqual({
      zoom: false,
      cursorPosition: true,
    })
  })

  it('takes the metadata from the factory before any machine exists', () => {
    const { factory, created } = createFactory({ cursor: true })
    const {
      tools: [tool],
    } = setupWith(factory)

    expect(tool.metadata).toEqual({
      __kind: 'computer_use',
      display: { width: 1280, height: 800 },
      environment: 'linux',
      capabilities: { zoom: false, cursorPosition: true },
    })
    expect(created).toEqual([])
  })

  it('returns a screenshot after an action', async () => {
    const computer = setup()

    await expect(computer.execute(CLICK)).resolves.toEqual(
      screenshotOf(PNG_BASE64),
    )
    expect(computer.calls).toEqual(['click:start', 'click:end', 'screenshot'])
  })

  it('sends only the screenshot bytes when the driver returns a small Node Buffer', async () => {
    // Node puts a small Buffer in a shared pool, so its ArrayBuffer holds other data too.
    const computer = setup({ screenshot: Buffer.from(PNG_BYTES) })

    await expect(computer.execute(CLICK)).resolves.toEqual(
      screenshotOf(PNG_BASE64),
    )
  })

  it('returns the zoom image and the cursor position as text', async () => {
    const computer = setup({ zoom: true, cursor: true })

    await expect(
      computer.execute({ action: 'zoom', region: [0, 0, 10, 10] }),
    ).resolves.toEqual(screenshotOf(ZOOM_BASE64))
    await expect(computer.execute({ action: 'cursor_position' })).resolves.toBe(
      'X=7,Y=9',
    )
    expect(computer.calls).toEqual([])
  })

  it('takes the screenshot only after screenshotDelay', async () => {
    vi.useFakeTimers()
    const computer = setup({ screenshotDelay: 500 })

    const result = computer.execute(CLICK)
    await vi.advanceTimersByTimeAsync(499)
    expect(computer.calls).toEqual(['click:start', 'click:end'])
    await vi.advanceTimersByTimeAsync(1)

    await expect(result).resolves.toEqual(screenshotOf(PNG_BASE64))
    expect(computer.calls).toEqual(['click:start', 'click:end', 'screenshot'])
  })

  it('runs concurrent calls one at a time, in call order', async () => {
    const { gate, open } = createGate()
    const computer = setup({ clickGate: gate })

    const first = computer.execute(CLICK, 'call_1')
    const second = computer.execute(TYPE, 'call_2')
    await vi.waitFor(() => expect(computer.calls).toEqual(['click:start']))
    open()
    await Promise.all([first, second])

    expect(computer.calls).toEqual([
      'click:start',
      'click:end',
      'screenshot',
      'type',
      'screenshot',
    ])
  })
})

describe('createComputerUse failed turn', () => {
  it('stops the turn after a failed action until the next model call', async () => {
    let isBroken = true
    const computer = setup({ failClick: () => isBroken })

    await expect(computer.execute(CLICK, 'call_1')).rejects.toThrow(
      'click failed',
    )
    await expect(computer.execute(TYPE, 'call_2')).rejects.toThrow(NOT_EXECUTED)
    isBroken = false
    await beforeModel(computer)

    await expect(computer.execute(CLICK, 'call_3')).resolves.toEqual(
      screenshotOf(PNG_BASE64),
    )
    expect(computer.calls).toEqual([
      'click:start',
      'click:start',
      'click:end',
      'screenshot',
    ])
  })
})

describe('createComputerUse safety checks', () => {
  it('refuses a call with checks that nobody approved', async () => {
    const computer = setup()

    await expect(computer.execute(CHECKED_CLICK)).rejects.toThrow('Refused')
    expect(computer.calls).toEqual([])
  })

  it('refuses a call whose checks do not parse', async () => {
    const computer = setup()

    await expect(
      computer.execute({ ...CLICK, pending_safety_checks: [{ code: 'x' }] }),
    ).rejects.toThrow('Refused')
    expect(computer.calls).toEqual([])
  })

  it('emits one interrupt per computer call with checks', async () => {
    const computer = setup()

    const result = await boundary(computer, [
      toolCall('call_1', CHECKED_CLICK),
      toolCall('call_2', CLICK),
      toolCall('call_3', CHECKED_CLICK, 'search'),
    ])

    expect(result?.interrupts).toEqual([
      expect.objectContaining({
        definition: computerSafetyCheck,
        key: 'call_1',
        payload: { checks: [CHECK], action: CLICK.action },
      }),
    ])
  })

  it('sends the OpenAI actions list as the action', async () => {
    const computer = setup()
    const actions = [CLICK.action, TYPE.action]

    const result = await boundary(computer, [
      toolCall('call_1', { actions, pending_safety_checks: [CHECK] }),
    ])

    expect(result?.interrupts[0]?.payload).toEqual({
      checks: [CHECK],
      action: actions,
    })
  })

  it('emits nothing outside beforeTools', async () => {
    const computer = setup()

    const result = await computer.middleware.onInterruptBoundary?.({
      ...createContext('afterTools', [
        {
          role: 'assistant',
          content: null,
          toolCalls: [toolCall('c', CHECKED_CLICK)],
        },
      ]),
      phase: 'afterTools',
    })

    expect(result).toBeUndefined()
  })

  it('runs an approved call and does not ask again', async () => {
    const computer = setup()

    expect(await resolve(computer, [answer('call_1', true)])).toEqual({
      toolResume: 'continue',
    })
    expect(
      await boundary(computer, [toolCall('call_1', CHECKED_CLICK)]),
    ).toBeUndefined()
    await expect(computer.execute(CHECKED_CLICK, 'call_1')).resolves.toEqual(
      screenshotOf(PNG_BASE64),
    )
  })

  it('cancels a declined call and does not ask again', async () => {
    const computer = setup()

    expect(await resolve(computer, [answer('call_1', false)])).toEqual({
      toolResume: 'cancel',
    })
    expect(
      await boundary(computer, [toolCall('call_1', CHECKED_CLICK)]),
    ).toBeUndefined()
    await expect(computer.execute(CHECKED_CLICK, 'call_1')).rejects.toThrow(
      'Refused',
    )
  })

  it('cancels the batch when one answer is cancelled', async () => {
    const computer = setup()

    const result = await resolve(computer, [
      answer('call_1', true),
      cancelled('call_2'),
    ])

    expect(result).toEqual({ toolResume: 'cancel' })
    await expect(computer.execute(CHECKED_CLICK, 'call_1')).rejects.toThrow(
      'Refused',
    )
  })

  it('does not unlock a call with an approval for another call', async () => {
    const computer = setup()

    await resolve(computer, [answer('call_2', true)])

    await expect(computer.execute(CHECKED_CLICK, 'call_1')).rejects.toThrow(
      'Refused',
    )
    expect(computer.calls).toEqual([])
  })

  it('has no opinion without safety-check answers', async () => {
    const computer = setup()

    expect(await resolve(computer, [])).toBeUndefined()
  })
})

describe('createComputerUse threads', () => {
  it('gives each thread its own machine from the factory', async () => {
    const { factory, created, machines } = createFactory()
    const computer = setupWith(factory)

    await computer.execute(CLICK, 'call_1', 'a')
    await computer.execute(TYPE, 'call_2', 'b')

    expect(created).toEqual(['a', 'b'])
    expect(machines.get('a')).toEqual([
      'click:start',
      'click:end',
      'screenshot',
    ])
    expect(machines.get('b')).toEqual(['type', 'screenshot'])
  })

  it('runs two threads one at a time on a shared driver', async () => {
    const { gate, open } = createGate()
    const { driver, calls } = createDriver({ clickGate: gate })
    const computer = setupWith(driver)
    const first = computer.execute(CLICK, 'call_1', 'a')
    const second = computer.execute(CLICK, 'call_2', 'b')
    await new Promise((done) => setTimeout(done, 0))

    expect(calls).toEqual(['click:start'])
    open()
    await Promise.all([first, second])
    expect(calls).toEqual([
      'click:start',
      'click:end',
      'screenshot',
      'click:start',
      'click:end',
      'screenshot',
    ])
  })

  it('runs two factory threads at the same time', async () => {
    const { gate, open } = createGate()
    const { factory, machines } = createFactory({ clickGate: gate })
    const computer = setupWith(factory)
    const first = computer.execute(CLICK, 'call_1', 'a')
    const second = computer.execute(CLICK, 'call_2', 'b')
    await new Promise((done) => setTimeout(done, 0))

    expect(machines.get('a')).toEqual(['click:start'])
    expect(machines.get('b')).toEqual(['click:start'])
    open()
    await Promise.all([first, second])
  })

  it('creates one machine for two calls at once on a new thread', async () => {
    const { factory, created, machines } = createFactory()
    const computer = setupWith(factory)

    await Promise.all([
      computer.execute(CLICK, 'call_1', 'a'),
      computer.execute(TYPE, 'call_2', 'a'),
    ])

    expect(created).toEqual(['a'])
    expect(machines.get('a')).toEqual([
      'click:start',
      'click:end',
      'screenshot',
      'type',
      'screenshot',
    ])
  })

  it('uses one shared thread for calls with no threadId', async () => {
    const { factory, created } = createFactory()
    const {
      tools: [tool],
    } = setupWith(factory)
    const context = { emitCustomEvent() {} }

    await tool.execute?.(CLICK, context)
    await tool.execute?.(TYPE, context)

    expect(created).toHaveLength(1)
  })

  it('keeps the approvals per thread', async () => {
    const computer = setup()

    await resolve(computer, [answer('call_1', true)], 'a')
    const otherThread = await boundary(
      computer,
      [toolCall('call_1', CHECKED_CLICK)],
      'b',
    )

    expect(otherThread?.interrupts).toHaveLength(1)
    await expect(
      computer.execute(CHECKED_CLICK, 'call_1', 'b'),
    ).rejects.toThrow('Refused')
    await expect(
      computer.execute(CHECKED_CLICK, 'call_1', 'a'),
    ).resolves.toEqual(screenshotOf(PNG_BASE64))
  })

  it('keeps the failed-turn flag per thread', async () => {
    const computer = setup({ failClick: () => true })

    await expect(computer.execute(CLICK, 'call_1', 'a')).rejects.toThrow(
      'click failed',
    )
    await expect(computer.execute(TYPE, 'call_2', 'b')).resolves.toEqual(
      screenshotOf(PNG_BASE64),
    )
    await beforeModel(computer, 'b')

    await expect(computer.execute(TYPE, 'call_3', 'a')).rejects.toThrow(
      NOT_EXECUTED,
    )
  })

  it('calls create again after it rejects', async () => {
    let isBroken = true
    const { factory, created } = createFactory({ failCreate: () => isBroken })
    const computer = setupWith(factory)

    await expect(computer.execute(CLICK, 'call_1', 'a')).rejects.toThrow(
      'create failed',
    )
    isBroken = false
    await beforeModel(computer, 'a')

    await expect(computer.execute(CLICK, 'call_2', 'a')).resolves.toEqual(
      screenshotOf(PNG_BASE64),
    )
    expect(created).toEqual(['a', 'a'])
  })
})

describe('createComputerUse close', () => {
  it('closes the machine of one thread with close(threadId)', async () => {
    const { factory, created, closed } = createFactory()
    const computer = setupWith(factory)
    await computer.execute(CLICK, 'call_1', 'a')
    await computer.execute(CLICK, 'call_2', 'b')

    await computer.close('a')
    await computer.execute(CLICK, 'call_3', 'a')

    expect(closed).toEqual(['a'])
    expect(created).toEqual(['a', 'b', 'a'])
  })

  it('closes every thread, then the factory, with close()', async () => {
    const { factory, closed } = createFactory()
    const computer = setupWith(factory)
    await computer.execute(CLICK, 'call_1', 'a')
    await computer.execute(CLICK, 'call_2', 'b')

    await computer.close()

    expect(closed).toEqual(['a', 'b', 'factory'])
  })

  it('closes the factory when a thread close fails, then throws', async () => {
    const { factory, closed } = createFactory()
    const create = factory.create
    factory.create = async (context) => {
      const driver = await create(context)
      if (context.threadId === 'a') {
        driver.close = async () => {
          throw new Error('close failed')
        }
      }
      return driver
    }
    const computer = setupWith(factory)
    await computer.execute(CLICK, 'call_1', 'a')
    await computer.execute(CLICK, 'call_2', 'b')

    await expect(computer.close()).rejects.toThrow('close failed')
    expect(closed).toEqual(['b', 'factory'])
  })

  it('does not throw for a closed or an unknown thread', async () => {
    const { factory, closed } = createFactory()
    const computer = setupWith(factory)
    await computer.execute(CLICK, 'call_1', 'a')

    await computer.close('a')
    await computer.close('a')
    await computer.close('unknown')

    expect(closed).toEqual(['a'])
  })

  it('waits for the running action before it closes the thread', async () => {
    const { gate, open } = createGate()
    const { factory, closed, machines } = createFactory({ clickGate: gate })
    const computer = setupWith(factory)
    const result = computer.execute(CLICK, 'call_1', 'a')
    await vi.waitFor(() => expect(machines.get('a')).toEqual(['click:start']))

    const closing = computer.close('a')
    await settle()
    expect(closed).toEqual([])
    open()
    await closing

    expect(closed).toEqual(['a'])
    await expect(result).resolves.toEqual(screenshotOf(PNG_BASE64))
    expect(machines.get('a')).toEqual([
      'click:start',
      'click:end',
      'screenshot',
    ])
  })

  it('never closes a driver that the app passed in', async () => {
    vi.useFakeTimers()
    let isBroken = true
    const computer = setup({ idleTimeout: 1000, failClick: () => isBroken })
    await expect(computer.execute(CLICK, 'call_1')).rejects.toThrow(
      'click failed',
    )
    isBroken = false

    await vi.advanceTimersByTimeAsync(1000)
    const next = computer.execute(TYPE, 'call_2')
    await vi.advanceTimersByTimeAsync(0)
    await computer.close(THREAD)
    await computer.close()

    // The idle timeout dropped the failed turn of the thread.
    await expect(next).resolves.toEqual(screenshotOf(PNG_BASE64))
    expect(computer.calls).not.toContain('close')
  })
})

describe('createComputerUse idle timeout', () => {
  it('closes and drops a thread after idleTimeout', async () => {
    vi.useFakeTimers()
    const { factory, created, closed } = createFactory()
    const computer = setupWith(factory, { idleTimeout: 1000 })
    const first = computer.execute(CLICK, 'call_1', 'a')
    await vi.advanceTimersByTimeAsync(0)
    await first

    await vi.advanceTimersByTimeAsync(999)
    expect(closed).toEqual([])
    await vi.advanceTimersByTimeAsync(1)
    expect(closed).toEqual(['a'])

    const second = computer.execute(CLICK, 'call_2', 'a')
    await vi.advanceTimersByTimeAsync(0)
    await second
    expect(created).toEqual(['a', 'a'])
  })

  it('starts the idle time only after a long action ends', async () => {
    vi.useFakeTimers()
    const { gate, open } = createGate()
    const { factory, closed } = createFactory({ clickGate: gate })
    const computer = setupWith(factory, { idleTimeout: 1000 })
    const result = computer.execute(CLICK, 'call_1', 'a')

    await vi.advanceTimersByTimeAsync(5000)
    expect(closed).toEqual([])
    open()
    await vi.advanceTimersByTimeAsync(0)
    await result
    await vi.advanceTimersByTimeAsync(999)
    expect(closed).toEqual([])
    await vi.advanceTimersByTimeAsync(1)

    expect(closed).toEqual(['a'])
  })

  it('logs a close error when the idle timeout closes a thread', async () => {
    vi.useFakeTimers()
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { factory, closed } = createFactory({ failClose: () => true })
    const computer = setupWith(factory, { idleTimeout: 1000 })
    const first = computer.execute(CLICK, 'call_1', 'a')
    await vi.advanceTimersByTimeAsync(0)
    await first

    await vi.advanceTimersByTimeAsync(1000)

    expect(closed).toEqual(['a'])
    expect(error).toHaveBeenCalledWith(
      'Failed to close the idle computer thread a.',
      expect.any(Error),
    )
    error.mockRestore()
  })

  it('never closes a thread with idleTimeout false', async () => {
    vi.useFakeTimers()
    const { factory, created, closed } = createFactory()
    const computer = setupWith(factory, { idleTimeout: false })
    const first = computer.execute(CLICK, 'call_1', 'a')
    await vi.advanceTimersByTimeAsync(0)
    await first

    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000)
    const second = computer.execute(CLICK, 'call_2', 'a')
    await vi.advanceTimersByTimeAsync(0)
    await second

    expect(closed).toEqual([])
    expect(created).toEqual(['a'])
  })
})

describe('createComputerUse navigate', () => {
  it('has no navigate tool for a driver without navigate', () => {
    const { tools } = setup()

    expect(tools.map((tool) => tool.name)).toEqual(['computer'])
  })

  it('has a navigate tool for a factory that can navigate', () => {
    const { factory } = createFactory({ navigate: true })
    const { tools } = setupWith(factory)

    expect(tools.map((tool) => tool.name)).toEqual(['computer', 'navigate'])
  })

  it('goes to the URL on the machine of the thread and returns a screenshot', async () => {
    const { factory, machines } = createFactory({ navigate: true })
    const computer = setupWith(factory)

    await expect(
      computer.navigate('https://tanstack.com', 'a'),
    ).resolves.toEqual(screenshotOf(PNG_BASE64))
    expect(machines.get('a')).toEqual([
      'navigate:https://tanstack.com',
      'screenshot',
    ])
  })

  it('asks for a full URL when the URL has no scheme', async () => {
    const computer = setup({ navigate: true })

    await expect(computer.navigate('tanstack.com')).rejects.toThrow(FULL_URL)
    expect(computer.calls).toEqual([])
  })

  it.each(['file:///etc/passwd', 'javascript:alert(1)'])(
    'refuses %s',
    async (url) => {
      const computer = setup({ navigate: true })

      await expect(computer.navigate(url)).rejects.toThrow(FULL_URL)
      expect(computer.calls).toEqual([])
    },
  )

  it('stops the turn after a refused navigate', async () => {
    const computer = setup({ navigate: true })

    await expect(computer.navigate('file:///etc/passwd')).rejects.toThrow(
      FULL_URL,
    )

    await expect(computer.execute(CLICK)).rejects.toThrow(NOT_EXECUTED)
  })

  it('fails when the factory says navigate but its driver has none', async () => {
    const { factory } = createFactory()
    const computer = setupWith({
      ...factory,
      capabilities: { ...factory.capabilities, navigate: true },
    })

    await expect(computer.navigate('https://tanstack.com')).rejects.toThrow(
      'no navigate method',
    )
  })
})
