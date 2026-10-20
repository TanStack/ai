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
import type { ComputerDriver } from '../src/types'

const PNG_BYTES = new Uint8Array([137, 80, 78, 71])
const PNG_BASE64 = 'iVBORw=='
const ZOOM_BYTES = new Uint8Array([1, 2, 3])
const ZOOM_BASE64 = 'AQID'

const CLICK = { action: { type: 'click', x: 10, y: 20, button: 'left' } }
const TYPE = { action: { type: 'type', text: 'hi' } }
const CHECK = { id: 'sc_1', code: 'malicious_instructions', message: 'Look.' }
const CHECKED_CLICK = { ...CLICK, pending_safety_checks: [CHECK] }
const NOT_EXECUTED =
  'Not executed: an earlier computer action in this turn failed.'

function screenshotOf(base64: string) {
  return [
    {
      type: 'image',
      source: { type: 'data', value: base64, mimeType: 'image/png' },
    },
  ]
}

interface DriverOptions {
  zoom?: boolean
  cursor?: boolean
  /** `click` throws while this returns true. */
  failClick?: () => boolean
  /** `click` waits for this promise. */
  clickGate?: Promise<void>
}

/** A driver that records its calls in order. */
function createDriver(options: DriverOptions) {
  const calls: Array<string> = []
  const record = (name: string) => async () => {
    calls.push(name)
  }
  const driver: ComputerDriver = {
    display: { width: 1024, height: 768 },
    environment: 'browser',
    screenshot: async () => {
      calls.push('screenshot')
      return PNG_BYTES
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
  }
  if (options.zoom) driver.zoom = async () => ZOOM_BYTES
  if (options.cursor) driver.cursorPosition = async () => ({ x: 7, y: 9 })
  return { driver, calls }
}

function setup(options: DriverOptions & { screenshotDelay?: number } = {}) {
  const { driver, calls } = createDriver(options)
  const computer = createComputerUse({
    driver,
    screenshotDelay: options.screenshotDelay ?? 0,
  })
  const execute = (input: unknown, toolCallId = 'call_1') => {
    if (!computer.tool.execute) throw new Error('The tool has no execute.')
    return computer.tool.execute(input, { toolCallId, emitCustomEvent() {} })
  }
  return { ...computer, calls, execute }
}

type Computer = ReturnType<typeof setup>

function createContext(
  phase: ChatMiddlewareContext['phase'],
  messages: Array<ModelMessage> = [],
): ChatMiddlewareContext {
  return {
    requestId: 'request',
    streamId: 'stream',
    runId: 'run',
    threadId: 'thread',
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
) {
  const messages: Array<ModelMessage> = [
    { role: 'user', content: 'Click the button.' },
    { role: 'assistant', content: null, toolCalls },
  ]
  return computer.middleware.onInterruptBoundary?.({
    ...createContext('beforeTools', messages),
    phase: 'beforeTools',
  })
}

function beforeModel(computer: Computer) {
  return computer.middleware.onConfig?.(createContext('beforeModel'), {
    messages: [],
    systemPrompts: [],
    tools: [computer.tool],
  })
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

function resolve(computer: Computer, items: Array<Resolution>) {
  const collection: InterruptResolutionCollection<typeof computerSafetyCheck> =
    {
      // TypeScript cannot tie a generic return to one definition. The chat
      // engine uses the same cast.
      for: () => items as never,
      all: () => items,
    }
  return computer.middleware.onInterruptResolution?.(
    createContext('init'),
    collection,
  )
}

afterEach(() => {
  vi.useRealTimers()
})

describe('createComputerUse tool', () => {
  it('is the computer tool with the driver metadata', () => {
    const { tool, interrupt } = setup({ zoom: true })

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
    const { tool } = setup({ cursor: true })

    expect(tool.metadata?.capabilities).toEqual({
      zoom: false,
      cursorPosition: true,
    })
  })

  it('returns a screenshot after an action', async () => {
    const computer = setup()

    await expect(computer.execute(CLICK)).resolves.toEqual(
      screenshotOf(PNG_BASE64),
    )
    expect(computer.calls).toEqual(['click:start', 'click:end', 'screenshot'])
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
    let openGate = () => {}
    const clickGate = new Promise<void>((open) => {
      openGate = open
    })
    const computer = setup({ clickGate })

    const first = computer.execute(CLICK, 'call_1')
    const second = computer.execute(TYPE, 'call_2')
    await vi.waitFor(() => expect(computer.calls).toEqual(['click:start']))
    openGate()
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
