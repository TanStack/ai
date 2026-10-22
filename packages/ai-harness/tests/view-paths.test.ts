import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai'
import { HARNESS_EVENTS, createPluginEvent } from '../src'
import { createSessionView } from '../src/view'
import { gate } from './helpers'
import { at, childRun, custom, sessionSnapshot } from './view-fixtures'
import { emptyUsage } from '../src/usage'
import type { Interrupt, StreamChunk } from '@tanstack/ai'
import type {
  Cursor,
  HarnessInput,
  MediaRecord,
  Receipt,
  SessionDescription,
  SessionEvent,
} from '../src'
import type { SessionView, SessionViewSource } from '../src/view'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

type StreamOptions = Parameters<SessionViewSource['events']>[0]

const accepted: Receipt = { inputId: 'i', status: 'accepted' }

/** An event stream the test writes to. It ends when the view aborts it. */
function createStream() {
  const queue: Array<SessionEvent> = []
  const opened: Array<StreamOptions> = []
  let wake = () => {}
  let ended = false
  let closed = false
  let failure: { error: unknown } | null = null
  const end = () => {
    ended = true
    wake()
  }
  async function* iterate() {
    try {
      while (true) {
        const entry = queue.shift()
        if (entry) {
          yield entry
          continue
        }
        if (failure) throw failure.error
        if (ended) return
        await new Promise<void>((resolve) => {
          wake = resolve
        })
      }
    } finally {
      closed = true
    }
  }
  return {
    /** The options of each `events()` call. */
    opened,
    /** True once the view stopped reading. */
    closed: () => closed,
    open: (options: StreamOptions) => {
      opened.push(options)
      options.signal?.addEventListener('abort', end, { once: true })
      return iterate()
    },
    push: (...entries: Array<SessionEvent>) => {
      queue.push(...entries)
      wake()
    },
    end,
    fail: (error: unknown) => {
      failure = { error }
      wake()
    },
    connect: (connection: 'open' | 'reconnecting') =>
      opened.at(-1)?.onConnection?.(connection),
  }
}

function emptyDescription(): SessionDescription {
  return { commands: [], config: [], tools: [] }
}

/** A session source whose reads and events the test controls. */
function createFake(overrides: Partial<SessionViewSource>) {
  const stream = createStream()
  /** What reached the session. */
  const inputs: Array<HarnessInput> = []
  const accept = async (input: HarnessInput) => {
    inputs.push(input)
    return accepted
  }
  const source: SessionViewSource = {
    send: (message, options) =>
      accept({ op: options?.mode ?? 'prompt', message }),
    resolve: ({ resume }) => accept({ op: 'resolve', resume }),
    cancel: () => accept({ op: 'cancel' }),
    answer: ({ questionId, value }) =>
      accept({ op: 'answer', questionId, value }),
    runCommand: ({ name, input }) => accept({ op: 'command', name, input }),
    setPluginSetting: ({ key, value }) => accept({ op: 'config', key, value }),
    events: (options) => stream.open(options),
    snapshot: () => sessionSnapshot(),
    transcript: async () => [],
    describe: () => emptyDescription(),
    ...overrides,
  }
  return { stream, inputs, source }
}

const views: Array<SessionView> = []
afterEach(() => {
  for (const view of views.splice(0)) view.dispose()
})

/** A view on a fake source, with the errors it reports. */
function startView(overrides: Partial<SessionViewSource> = {}) {
  const fake = createFake(overrides)
  const view = createSessionView(fake.source)
  views.push(view)
  const errors: Array<string> = []
  view.on('error', (message) => errors.push(message))
  return { ...fake, view, errors }
}

/** `startView`, after the view read the session once. */
async function openView(overrides: Partial<SessionViewSource> = {}) {
  const started = startView(overrides)
  await started.view.ready
  return started
}

/** Let every pending promise callback run. No timer picks a branch. */
const drain = () => new Promise<void>((resolve) => setImmediate(resolve))

const says = (delta: string) =>
  at({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm', delta })
const runStarted = () =>
  at({ type: EventType.RUN_STARTED, threadId: 't', runId: 'r' })
const runFinished = () =>
  at({ type: EventType.RUN_FINISHED, threadId: 't', runId: 'r' })

function notices(view: SessionView) {
  return view.store
    .get()
    .messages.flatMap((message) =>
      message.role === 'notice'
        ? [{ kind: message.kind, text: message.text }]
        : [],
    )
}

function assistantText(view: SessionView) {
  return view.store
    .get()
    .messages.flatMap((message) =>
      message.role === 'assistant' ? message.parts : [],
    )
    .flatMap((part) => (part.type === 'text' ? [part.text] : []))
    .join('')
}

const deleteFile: Interrupt = {
  id: 'a',
  reason: 'confirm',
  message: 'Delete the file?',
}
const plain: Interrupt = { id: 'b', reason: 'confirm' }
const waiting = sessionSnapshot({
  status: 'requires_action',
  interrupts: [deleteFile, plain],
})
const confirm = {
  questionId: 'q1',
  message: 'Sure?',
  schema: { type: 'boolean' },
}
const planCommand = {
  name: 'plan',
  description: 'Plan first',
  owner: 'test/planner',
}

describe('session view start', () => {
  const failedReads: Array<{
    read: string
    overrides: Partial<SessionViewSource>
    from: Cursor | undefined
  }> = [
    {
      read: 'transcript',
      overrides: {
        transcript: () => Promise.reject(new Error('transcript down')),
      },
      from: '0',
    },
    {
      // With no snapshot there is no cursor, so events come from the start.
      read: 'snapshot',
      overrides: { snapshot: () => Promise.reject(new Error('snapshot down')) },
      from: undefined,
    },
    {
      read: 'describe',
      overrides: { describe: () => Promise.reject(new Error('describe down')) },
      from: '0',
    },
  ]

  it.each(failedReads)(
    'shows a failed $read read and still reads events',
    async ({ read, overrides, from }) => {
      const { view, stream, errors } = await openView(overrides)

      stream.push(says('Still here.'))

      await waitFor(() => expect(assistantText(view)).toBe('Still here.'))
      expect(errors).toEqual([`${read} down`])
      expect(notices(view)).toEqual([{ kind: 'error', text: `${read} down` }])
      expect(stream.opened[0]?.from).toBe(from)
    },
  )

  it('does not read events when disposed before start ends', async () => {
    const hold = gate()
    const { view, stream } = startView({
      transcript: async () => {
        await hold.opened
        return [{ role: 'user', content: 'old question' }]
      },
    })

    view.dispose()
    hold.open()
    await view.ready

    expect(stream.opened).toEqual([])
    expect(view.store.get().messages).toEqual([])
    expect(view.store.get().connection).toBe('closed')
  })
})

describe('session view events', () => {
  it('shows a failed event stream as an error, then closes', async () => {
    const { view, stream, errors } = await openView()

    // A source can throw a value that is not an Error.
    stream.fail('socket closed')

    await waitFor(() => expect(view.store.get().connection).toBe('closed'))
    expect(errors).toEqual(['socket closed'])
    expect(notices(view)).toEqual([{ kind: 'error', text: 'socket closed' }])
  })

  it('closes when the event stream ends', async () => {
    const { view, stream, errors } = await openView()

    stream.end()

    await waitFor(() => expect(view.store.get().connection).toBe('closed'))
    expect(errors).toEqual([])
  })

  it('follows the connection state that the source reports', async () => {
    const { view, stream } = await openView()

    stream.connect('reconnecting')
    expect(view.store.get().connection).toBe('reconnecting')

    stream.connect('open')
    expect(view.store.get().connection).toBe('open')
  })

  it('ignores an event that comes after dispose', async () => {
    const { view, stream } = await openView()
    const calls: Array<string> = []
    view.on('toolCall', (call) => calls.push(call.id))

    view.dispose()
    stream.push(
      at({
        type: EventType.TOOL_CALL_START,
        toolCallId: 'c1',
        toolCallName: 'read',
      }),
    )

    await waitFor(() => expect(stream.closed()).toBe(true))
    expect(calls).toEqual([])
    expect(view.store.get().messages).toEqual([])
  })

  it('reads the snapshot again after a lead run event, not after a child run event', async () => {
    const snapshot = vi.fn(() => sessionSnapshot({ queuedTurns: 1 }))
    snapshot.mockReturnValueOnce(sessionSnapshot())
    const { view, stream } = await openView({ snapshot })

    stream.push(at(childRun.started), at(childRun.finished), runFinished())

    await waitFor(() => expect(view.store.get().queuedTurns).toBe(1))
    await drain()
    expect(snapshot).toHaveBeenCalledTimes(2)
  })

  it('reads the snapshot once more for events that come during a read', async () => {
    const hold = gate()
    const snapshot = vi.fn(async () => sessionSnapshot({ queuedTurns: 2 }))
    snapshot
      .mockResolvedValueOnce(sessionSnapshot())
      .mockReturnValueOnce(
        hold.opened.then(() => sessionSnapshot({ queuedTurns: 1 })),
      )
    const { view, stream } = await openView({ snapshot })

    stream.push(
      runStarted(),
      runFinished(),
      custom(HARNESS_EVENTS.operationFinished, { operationId: 'op-1' }),
      says('Done.'),
    )
    await waitFor(() => expect(assistantText(view)).toBe('Done.'))
    hold.open()

    await waitFor(() => expect(view.store.get().queuedTurns).toBe(2))
    await drain()
    expect(snapshot).toHaveBeenCalledTimes(3)
  })

  it('shows a failed snapshot read after an event', async () => {
    const snapshot = vi.fn(async () => sessionSnapshot())
    snapshot
      .mockResolvedValueOnce(sessionSnapshot())
      .mockRejectedValueOnce(new Error('snapshot down'))
    const { view, stream, errors } = await openView({ snapshot })

    stream.push(runFinished())

    await waitFor(() => expect(errors).toEqual(['snapshot down']))
    expect(notices(view)).toEqual([{ kind: 'error', text: 'snapshot down' }])
  })

  it('reads the description again after a setting changes', async () => {
    const describeSession = vi.fn(() => ({
      ...emptyDescription(),
      commands: [planCommand],
    }))
    describeSession.mockReturnValueOnce(emptyDescription())
    const { view, stream } = await openView({ describe: describeSession })
    expect(view.store.get().commands).toEqual([])

    stream.push(
      custom(HARNESS_EVENTS.configChanged, { key: 'mode', value: 'plan' }),
    )

    await waitFor(() =>
      expect(view.store.get().commands).toEqual([planCommand]),
    )
  })

  it('shows a failed description read after a setting changes', async () => {
    const describeSession = vi.fn(async () => emptyDescription())
    describeSession
      .mockResolvedValueOnce(emptyDescription())
      .mockRejectedValueOnce(new Error('describe down'))
    const { stream, errors } = await openView({ describe: describeSession })

    stream.push(
      custom(HARNESS_EVENTS.configChanged, { key: 'mode', value: 'plan' }),
    )

    await waitFor(() => expect(errors).toEqual(['describe down']))
  })

  it('ignores reads that end after dispose', async () => {
    const hold = gate()
    const snapshot = vi.fn(async () => {
      await hold.opened
      return waiting
    })
    snapshot.mockResolvedValueOnce(sessionSnapshot())
    const describeSession = vi.fn(async () => {
      await hold.opened
      return { ...emptyDescription(), commands: [planCommand] }
    })
    describeSession.mockResolvedValueOnce(emptyDescription())
    const { view, stream } = await openView({
      snapshot,
      describe: describeSession,
    })
    const asked: Array<string> = []
    view.on('approval', (approval) => asked.push(approval.id))

    stream.push(
      runFinished(),
      custom(HARNESS_EVENTS.configChanged, { key: 'mode', value: 'plan' }),
    )
    await waitFor(() => {
      expect(snapshot).toHaveBeenCalledTimes(2)
      expect(describeSession).toHaveBeenCalledTimes(2)
    })
    view.dispose()
    hold.open()
    await drain()

    expect(asked).toEqual([])
    expect(view.store.get().approvals).toEqual([])
    expect(view.store.get().commands).toEqual([])
  })

  it('ignores a failure that comes after dispose', async () => {
    const hold = gate()
    const { view, errors } = await openView({
      cancel: async () => {
        await hold.opened
        throw new Error('late failure')
      },
    })

    const cancelling = view.cancel()
    view.dispose()
    hold.open()
    await cancelling

    expect(errors).toEqual([])
  })
})

describe('session view actions', () => {
  it('sends settings, cancels, and slash commands with input to the source', async () => {
    const { view, inputs } = await openView()

    await view.setPluginSetting({ key: 'mode', value: 'plan' })
    await view.cancel()
    await view.send('/goal ship it')

    expect(inputs).toEqual([
      { op: 'config', key: 'mode', value: 'plan' },
      { op: 'cancel' },
      { op: 'command', name: 'goal', input: 'ship it' },
    ])
  })

  const down = () =>
    Promise.reject(new Error('Harness request failed (500): down'))
  const failingActions: Array<{
    action: string
    overrides: Partial<SessionViewSource>
    act: (view: SessionView) => Promise<void>
  }> = [
    {
      action: 'setPluginSetting',
      overrides: { setPluginSetting: down },
      act: (view) => view.setPluginSetting({ key: 'mode', value: 'plan' }),
    },
    {
      action: 'cancel',
      overrides: { cancel: down },
      act: (view) => view.cancel(),
    },
    {
      action: 'a steer',
      overrides: {
        send: down,
        snapshot: () => sessionSnapshot({ status: 'running' }),
      },
      act: (view) => view.send('faster'),
    },
    {
      action: 'a remote prompt',
      overrides: { send: down },
      act: (view) => view.send('hi'),
    },
    {
      action: 'a remote command',
      overrides: { runCommand: down },
      act: (view) => view.send('/ping'),
    },
  ]

  it.each(failingActions)(
    'shows an error notice when $action fails',
    async ({ overrides, act }) => {
      const { view, errors } = await openView(overrides)

      await act(view)

      await waitFor(() =>
        expect(errors).toEqual(['Harness request failed (500): down']),
      )
      expect(notices(view)).toEqual([
        { kind: 'error', text: 'Harness request failed (500): down' },
      ])
    },
  )

  it('adds nothing when a local operation fails', async () => {
    const { view, errors } = await openView({
      // A local session returns an Operation. It reports failures as events.
      send: () =>
        Object.assign(Promise.reject(new Error('turn failed')), {
          status: () => 'failed',
        }),
    })

    await view.send('hi')
    await drain()

    expect(errors).toEqual([])
    expect(view.store.get().messages).toEqual([
      { id: 'user-0', role: 'user', text: 'hi' },
    ])
  })
})

describe('session view approvals', () => {
  it('makes approvals from interrupts that have no tool call', async () => {
    const { view } = await openView({ snapshot: () => waiting })

    // Strict: no `toolCallId` key, and no `message` key when there is none.
    expect(view.store.get().approvals).toStrictEqual([
      {
        id: 'a',
        tool: 'Delete the file?',
        args: undefined,
        message: 'Delete the file?',
        approve: expect.any(Function),
        reject: expect.any(Function),
      },
      {
        id: 'b',
        tool: 'tool',
        args: undefined,
        approve: expect.any(Function),
        reject: expect.any(Function),
      },
    ])
  })

  it('rejects every approval with one resolve', async () => {
    const snapshot = vi.fn(() => sessionSnapshot())
    snapshot.mockReturnValueOnce(waiting)
    const { view, inputs } = await openView({ snapshot })

    view.rejectAll()

    expect(inputs).toEqual([
      {
        op: 'resolve',
        resume: [
          { interruptId: 'a', status: 'resolved', payload: false },
          { interruptId: 'b', status: 'resolved', payload: false },
        ],
      },
    ])
    expect(view.store.get().approvals).toEqual([])
  })

  it('ignores a decision for an approval that is not open, also when it opens later', async () => {
    const late: Interrupt = { id: 'late', reason: 'confirm' }
    const snapshot = vi.fn(() =>
      sessionSnapshot({ interrupts: [deleteFile, late] }),
    )
    snapshot.mockReturnValueOnce(sessionSnapshot({ interrupts: [deleteFile] }))
    const { view, stream, inputs } = await openView({ snapshot })

    view.approve({ id: 'late' })
    stream.push(runFinished())
    await waitFor(() => expect(view.store.get().approvals).toHaveLength(2))
    view.approve({ id: 'a' })

    // `late` still waits for its own answer.
    expect(inputs).toEqual([])
  })

  it('shows a failed resolve, then reads the snapshot again', async () => {
    const snapshot = vi.fn(() => waiting)
    const { view, errors } = await openView({
      snapshot,
      resolve: () => Promise.reject(new Error('resolve down')),
    })

    view.approveAll()
    expect(view.store.get().approvals).toEqual([])

    await waitFor(() => expect(view.store.get().approvals).toHaveLength(2))
    expect(errors).toEqual(['resolve down'])
    expect(snapshot).toHaveBeenCalledTimes(2)
  })
})

describe('session view on()', () => {
  const configDown = () => Promise.reject(new Error('config down'))

  it('stops calling a handler after it unsubscribes', async () => {
    const { view, errors } = await openView({ setPluginSetting: configDown })
    const heard: Array<string> = []
    const stop = view.on('error', (message) => heard.push(message))

    stop()
    await view.setPluginSetting({ key: 'mode', value: 'plan' })

    expect(errors).toEqual(['config down'])
    expect(heard).toEqual([])
  })

  it('calls the next handler when one throws', async () => {
    const { view } = await openView({ setPluginSetting: configDown })
    const heard: Array<string> = []
    view.on('error', () => {
      throw new Error('broken handler')
    })
    view.on('error', (message) => heard.push(message))

    await view.setPluginSetting({ key: 'mode', value: 'plan' })

    expect(heard).toEqual(['config down'])
  })

  it('sends plugin events to their handlers', async () => {
    const Pinged = createPluginEvent<{ count: number }>('test/pinged')
    const Numbered = createPluginEvent<{ count: number }>('7')
    const { view, stream } = await openView()
    const pings: Array<{ count: number }> = []
    const numbered: Array<{ count: number }> = []
    view.on(Pinged, (value) => pings.push(value))
    view.on(Numbered, (value) => numbered.push(value))

    stream.push(
      // A plugin event needs a string name.
      custom(HARNESS_EVENTS.pluginEvent, { name: 7, value: { count: 1 } }),
      custom('test.note', null),
      custom(HARNESS_EVENTS.pluginEvent, {
        plugin: 'test/p',
        name: 'test/pinged',
        value: { count: 3 },
      }),
    )

    await waitFor(() => expect(pings).toEqual([{ count: 3 }]))
    expect(numbered).toEqual([])
  })

  it('fires toolCall and agent events', async () => {
    const { view, stream } = await openView()
    const calls: Array<{ id: string; name: string }> = []
    const agents: Array<{ id: string; name: string; status: string }> = []
    view.on('toolCall', (call) => calls.push(call))
    view.on('agent', (agent) => agents.push(agent))

    stream.push(
      at({
        type: EventType.TOOL_CALL_START,
        toolCallId: 'c1',
        toolCallName: 'read',
      }),
      at({
        type: EventType.SUBAGENT_STARTED,
        subagentRunId: 's1',
        name: 'helper',
      }),
      at({ type: EventType.SUBAGENT_FINISHED, subagentRunId: 's1' }),
      at({
        type: EventType.SUBAGENT_STARTED,
        subagentRunId: 's2',
        name: 'fixer',
      }),
      at({
        type: EventType.SUBAGENT_ERROR,
        subagentRunId: 's2',
        message: 'no key',
      }),
      // An error for a child whose start the view never saw.
      at({
        type: EventType.SUBAGENT_ERROR,
        subagentRunId: 'ghost',
        message: 'lost',
      }),
    )

    await waitFor(() => expect(agents).toHaveLength(5))
    expect(calls).toEqual([{ id: 'c1', name: 'read' }])
    expect(agents).toEqual([
      { id: 's1', name: 'helper', status: 'running' },
      { id: 's1', name: 'helper', status: 'done' },
      { id: 's2', name: 'fixer', status: 'running' },
      { id: 's2', name: 'fixer', status: 'failed' },
      { id: 'ghost', name: 'agent', status: 'failed' },
    ])
  })

  it('fires each question once, and answers it through the source', async () => {
    const named = { questionId: 'q2', message: 'Name?' }
    const snapshot = vi.fn(() =>
      sessionSnapshot({ questions: [confirm, named], queuedTurns: 1 }),
    )
    snapshot.mockReturnValueOnce(
      sessionSnapshot({ questions: [confirm, named] }),
    )
    const { view, stream, inputs } = startView({ snapshot })
    const asked: Array<string> = []
    view.on('question', (question) => asked.push(question.id))
    await view.ready

    stream.push(runFinished())
    await waitFor(() => expect(view.store.get().queuedTurns).toBe(1))

    expect(asked).toEqual(['q1', 'q2'])
    // Strict: a question without a schema has no `schema` key.
    expect(view.store.get().questions).toStrictEqual([
      {
        id: 'q1',
        message: 'Sure?',
        schema: { type: 'boolean' },
        answer: expect.any(Function),
      },
      { id: 'q2', message: 'Name?', answer: expect.any(Function) },
    ])
    await view.store.get().questions[0]?.answer(true)
    expect(inputs).toEqual([{ op: 'answer', questionId: 'q1', value: true }])
  })

  it('fires a sign-in event once for a connector that needs one', async () => {
    const { view, stream } = await openView()
    const signIns: Array<{ connector: string }> = []
    view.on('signIn', (signIn) => signIns.push(signIn))

    stream.push(
      custom(HARNESS_EVENTS.authRequired, {
        connector: 'notion',
        url: 'https://notion.example/auth',
        userCode: 'AB-12',
      }),
      says('Waiting.'),
    )

    await waitFor(() => expect(assistantText(view)).toBe('Waiting.'))
    expect(signIns).toEqual([
      {
        connector: 'notion',
        url: 'https://notion.example/auth',
        userCode: 'AB-12',
      },
    ])
  })

  it('fires turnEnd only for chat operations', async () => {
    const { view, stream } = await openView()
    const ended: Array<string> = []
    view.on('turnEnd', ({ operationId }) => ended.push(operationId))

    stream.push(
      custom(HARNESS_EVENTS.operationStarted, {
        operationId: 'op-c',
        kind: 'command',
      }),
      custom(HARNESS_EVENTS.operationFinished, { operationId: 'op-c' }),
      custom(HARNESS_EVENTS.operationStarted, {
        operationId: 'op-t',
        kind: 'chat',
      }),
      custom(HARNESS_EVENTS.operationFinished, { operationId: 'op-t' }),
    )

    await waitFor(() => expect(ended).toEqual(['op-t']))
  })

  it('reports a lead run error and a rejected input, not a child run error', async () => {
    const { stream, errors } = await openView()

    stream.push(
      at(childRun.error),
      custom(HARNESS_EVENTS.inputRejected, { inputId: 'i' }),
      at({ type: EventType.RUN_ERROR, message: 'boom' }),
    )

    await waitFor(() => expect(errors).toHaveLength(2))
    expect(errors).toEqual(['Not accepted: unknown reason', 'Error: boom'])
  })
})

const removeApproval: Interrupt = {
  id: 'ap-1',
  reason: 'tool_call',
  toolCallId: 'c7',
  metadata: {
    'tanstack:interruptBinding': {
      v: 1,
      kind: 'tool-approval',
      interruptId: 'ap-1',
      toolName: 'remove',
      toolCallId: 'c7',
      originalArgs: { path: 'a.txt' },
      inputSchemaHash: 'in',
      approvalSchemaHash: 'approval',
      responseSchemaHash: 'response',
    },
  },
}
const regionInput: Interrupt = {
  id: 'mcp_input_c9',
  reason: 'mcp_input',
  message: 'Input required to run deploy',
  toolCallId: 'c9',
  metadata: {
    'tanstack:interruptBinding': {
      v: 1,
      kind: 'generic',
      interruptId: 'mcp_input_c9',
    },
    'tanstack:interruptPayload': { kind: 'form', request: { field: 'region' } },
  },
}
const stopped = sessionSnapshot({
  status: 'requires_action',
  interrupts: [removeApproval, regionInput],
})

/** A source call that records its name and arguments in `calls`. */
function recorder(calls: Array<Array<unknown>>) {
  return (name: string) =>
    async (...args: Array<unknown>) => {
      calls.push([name, ...args])
      return accepted
    }
}

describe('session view inputs', () => {
  it('sends follow-ups, waiting inputs, settings, and context changes to the source', async () => {
    const calls: Array<Array<unknown>> = []
    const record = recorder(calls)
    const { view, errors } = await openView({
      send: record('followUp'),
      continueWithoutMessage: record('continue'),
      cancel: record('cancel'),
      cancelInput: record('cancelInput'),
      changeInputDelivery: record('setDelivery'),
      updateThreadSettings: record('configure'),
      reset: record('reset'),
      revert: record('revert'),
      unrevert: record('unrevert'),
    })

    await view.followUp('then the tests')
    await view.continueWithoutMessage()
    await view.cancel({ operationId: 'op-2' })
    await view.cancelInput({ inputId: 'in-1' })
    await view.changeInputDelivery({ inputId: 'in-2', delivery: 'steer' })
    await view.updateThreadSettings({ settings: { model: 'strong' } })
    await view.reset({ note: 'Start over.' })
    await view.revert({ messageId: 'm1' })
    await view.unrevert()
    await drain()

    expect(calls).toEqual([
      ['followUp', 'then the tests', { mode: 'followUp' }],
      ['continue'],
      ['cancel', { operationId: 'op-2' }],
      ['cancelInput', { inputId: 'in-1' }],
      ['setDelivery', { inputId: 'in-2', delivery: 'steer' }],
      ['configure', { settings: { model: 'strong' } }],
      ['reset', { note: 'Start over.' }],
      ['revert', { messageId: 'm1' }],
      ['unrevert'],
    ])
    expect(view.store.get().messages).toEqual([
      { id: 'user-0', role: 'user', text: 'then the tests' },
    ])
    expect(errors).toEqual([])
  })

  it('shows an error for an action the source does not have', async () => {
    const { view, errors } = await openView()

    await view.reset()
    await view.continueWithoutMessage()
    await drain()

    expect(errors).toEqual([
      'This view source cannot reset.',
      'This view source cannot continue.',
    ])
  })

  it('stores a file through the source, and rejects when it cannot', async () => {
    const file: MediaRecord = {
      id: 'f1',
      threadId: 't',
      kind: 'image',
      mimeType: 'image/png',
      name: 'a.png',
      size: 1,
      source: 'user',
      createdAt: 0,
    }
    const putMedia = vi.fn(async () => file)
    const info = { name: 'a.png', mimeType: 'image/png' }
    const { view } = await openView({ putMedia })
    const bare = await openView()

    expect(await view.putMedia({ body: new Uint8Array([1]), ...info })).toBe(
      file,
    )
    expect(putMedia).toHaveBeenCalledWith({
      body: new Uint8Array([1]),
      name: 'a.png',
      mimeType: 'image/png',
    })
    await expect(
      bare.view.putMedia({ body: new Uint8Array([1]), ...info }),
    ).rejects.toThrow('This view source cannot store media.')
  })
})

describe('session view interrupts', () => {
  it('answers an approval with edited arguments and an input request in one resolve', async () => {
    const snapshot = vi.fn(() => sessionSnapshot())
    snapshot.mockReturnValueOnce(stopped)
    const started = startView({ snapshot })
    const fired: Array<string> = []
    started.view.on('interrupt', (item) => fired.push(item.id))
    await started.view.ready
    const { view, inputs } = started
    const [approval] = view.store.get().approvals
    const [request] = view.store.get().interrupts

    // The view never saw the call, so the binding names the tool.
    expect(approval).toMatchObject({ tool: 'remove', args: { path: 'a.txt' } })
    expect(request).toMatchObject({
      id: 'mcp_input_c9',
      reason: 'mcp_input',
      message: 'Input required to run deploy',
      toolCallId: 'c9',
      payload: { kind: 'form', request: { field: 'region' } },
    })
    expect(fired).toEqual(['mcp_input_c9'])
    approval?.approve({ editedArgs: { path: 'b.txt' } })
    expect(inputs).toEqual([])
    request?.resolve({ region: 'eu' })

    expect(inputs).toEqual([
      {
        op: 'resolve',
        resume: [
          {
            interruptId: 'ap-1',
            status: 'resolved',
            payload: { editedArgs: { path: 'b.txt' }, approved: true },
          },
          {
            interruptId: 'mcp_input_c9',
            status: 'resolved',
            payload: { region: 'eu' },
          },
        ],
      },
    ])
    expect(view.store.get().interrupts).toEqual([])
  })

  it('rejects an approval with a payload, and cancels an input request', async () => {
    const snapshot = vi.fn(() => sessionSnapshot())
    snapshot.mockReturnValueOnce(stopped)
    const { view, inputs } = await openView({ snapshot })

    view.reject({ id: 'ap-1', payload: { reason: 'wrong file' } })
    view.store.get().interrupts[0]?.cancel()

    expect(inputs).toEqual([
      {
        op: 'resolve',
        resume: [
          {
            interruptId: 'ap-1',
            status: 'resolved',
            payload: { approved: false, payload: { reason: 'wrong file' } },
          },
          { interruptId: 'mcp_input_c9', status: 'cancelled' },
        ],
      },
    ])
  })

  it('does not end a turn that stops for an interrupt', async () => {
    const { view, stream } = await openView()
    const ended: Array<string> = []
    view.on('turnEnd', ({ operationId }) => ended.push(operationId))
    const turn = (operationId: string, status: string) => [
      custom(HARNESS_EVENTS.operationStarted, { operationId, kind: 'chat' }),
      custom(HARNESS_EVENTS.operationFinished, { operationId, status }),
    ]

    stream.push(...turn('op-a', 'interrupted'), ...turn('op-b', 'completed'))

    await waitFor(() => expect(ended).toEqual(['op-b']))
  })
})

/** A session event of `operationId` at `cursor`. */
const entry = (
  cursor: number,
  event: StreamChunk,
  operationId = 'op-1',
): SessionEvent => ({
  cursor: String(cursor),
  threadId: 't1',
  operationId,
  event,
})

describe('session view reload', () => {
  it('shows a running turn from its start, without what the transcript has', async () => {
    const { view, stream } = await openView({
      snapshot: () =>
        sessionSnapshot({
          status: 'running',
          activeOperations: [{ id: 'op-1', kind: 'chat', startedCursor: '0' }],
          cursor: '4',
        }),
      // The turn saved its first model call when its tool started.
      transcript: async () => [
        { id: 'u1', role: 'user', content: 'Clean up' },
        {
          id: 'm1',
          role: 'assistant',
          content: 'Looking.',
          toolCalls: [
            {
              id: 'c1',
              type: 'function',
              function: { name: 'list', arguments: '{}' },
            },
          ],
        },
      ],
    })
    const reasoning = (messageId: string, delta: string) =>
      ({ type: EventType.REASONING_MESSAGE_CONTENT, messageId, delta }) as const

    stream.push(
      entry(1, reasoning('r1', 'Plan.')),
      entry(2, {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'm1',
        delta: 'Looking.',
      }),
      entry(3, {
        type: EventType.TOOL_CALL_START,
        toolCallId: 'c1',
        toolCallName: 'list',
      }),
      entry(4, { type: EventType.TOOL_CALL_END, toolCallId: 'c1' }),
      entry(5, {
        type: EventType.TOOL_CALL_RESULT,
        toolCallId: 'c1',
        messageId: 'x',
        content: '["a.txt"]',
      }),
      entry(6, reasoning('r2', 'Next.')),
      entry(7, {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'm2',
        delta: 'Done.',
      }),
    )

    await waitFor(() => expect(assistantText(view)).toBe('Looking.Done.'))
    expect(stream.opened[0]?.from).toBe('0')
    expect(view.store.get().messages).toMatchObject([
      { role: 'user', text: 'Clean up' },
      {
        role: 'assistant',
        parts: [
          { type: 'text', text: 'Looking.' },
          { type: 'tool-call', id: 'c1', status: 'done', result: ['a.txt'] },
        ],
      },
      {
        id: 'turn-op-1',
        role: 'assistant',
        parts: [
          { type: 'reasoning', text: 'Next.' },
          { type: 'text', text: 'Done.' },
        ],
      },
    ])
  })

  it('drops the reasoning of each saved model call, also when the replay comes in chunks', async () => {
    const call = (id: string) => ({
      id,
      type: 'function' as const,
      function: { name: 'list', arguments: '{}' },
    })
    const { view, stream } = await openView({
      snapshot: () =>
        sessionSnapshot({
          status: 'running',
          activeOperations: [{ id: 'op-1', kind: 'chat', startedCursor: '0' }],
          cursor: '9',
        }),
      transcript: async () => [
        { id: 'm1', role: 'assistant', content: 'A.', toolCalls: [call('c1')] },
        { role: 'tool', toolCallId: 'c1', content: '1' },
        { id: 'm2', role: 'assistant', content: 'B.', toolCalls: [call('c2')] },
      ],
    })
    const think = (messageId: string) =>
      ({
        type: EventType.REASONING_MESSAGE_CONTENT,
        messageId,
        delta: `Think ${messageId}.`,
      }) as const
    const says = (messageId: string, delta: string) =>
      ({ type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta }) as const
    const started = (toolCallId: string) =>
      ({
        type: EventType.TOOL_CALL_START,
        toolCallId,
        toolCallName: 'list',
      }) as const
    const result = (toolCallId: string) =>
      ({
        type: EventType.TOOL_CALL_RESULT,
        toolCallId,
        messageId: 'x',
        content: '1',
      }) as const

    stream.push(
      entry(1, think('r1')),
      entry(2, says('m1', 'A.')),
      entry(3, started('c1')),
      entry(4, result('c1')),
    )
    // A remote replay comes in chunks, with a macrotask between them.
    await new Promise((resolve) => setTimeout(resolve, 10))
    stream.push(
      entry(5, think('r2')),
      entry(6, says('m2', 'B.')),
      entry(7, started('c2')),
      entry(10, result('c2')),
      entry(11, think('r3')),
      entry(12, says('m3', 'C.')),
    )

    await waitFor(() => expect(assistantText(view)).toBe('A.B.C.'))
    expect(view.store.get().messages.at(-1)).toMatchObject({
      id: 'turn-op-1',
      parts: [
        { type: 'reasoning', text: 'Think r3.' },
        { type: 'text', text: 'C.' },
      ],
    })
  })

  it('drops replayed reasoning of an attempt that a retry ends', async () => {
    const { view, stream } = await openView({
      snapshot: () =>
        sessionSnapshot({
          status: 'running',
          activeOperations: [{ id: 'op-1', kind: 'chat', startedCursor: '0' }],
          cursor: '3',
        }),
    })

    stream.push(
      entry(1, {
        type: EventType.REASONING_MESSAGE_CONTENT,
        messageId: 'r1',
        delta: 'Lost.',
      }),
      entry(2, {
        type: EventType.CUSTOM,
        name: HARNESS_EVENTS.turnRetry,
        value: { operationId: 'op-1', retries: 1, continued: false },
      }),
      entry(3, {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'm2',
        delta: 'Answer.',
      }),
    )

    await waitFor(() => expect(assistantText(view)).toBe('Answer.'))
    expect(view.store.get().messages).toMatchObject([
      { parts: [{ type: 'text', text: 'Answer.' }] },
    ])
  })

  it('replays only the operations that run', async () => {
    const { view, stream } = await openView({
      snapshot: () =>
        sessionSnapshot({
          activeOperations: [{ id: 'op-1', kind: 'agent', startedCursor: '0' }],
          // A durable log counts records that are no events.
          cursor: '9',
        }),
    })
    const says = (messageId: string, delta: string) =>
      ({ type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta }) as const

    stream.push(
      entry(1, says('m-old', 'Old turn.'), 'op-old'),
      entry(2, says('m1', 'Still working.')),
    )

    await waitFor(() => expect(assistantText(view)).toBe('Still working.'))
  })

  it('shows how a background child ended, from its saved card', async () => {
    const call = (id: string) => ({
      id,
      type: 'function' as const,
      function: { name: 'writer', arguments: '{}' },
    })
    const started = (toolCallId: string, subagentRunId: string) => ({
      role: 'tool' as const,
      toolCallId,
      content: JSON.stringify({ subagentRunId, result: { status: 'started' } }),
    })
    const { view } = await openView({
      transcript: async () => [
        {
          id: 'm1',
          role: 'assistant',
          content: null,
          toolCalls: [call('c1'), call('c2')],
        },
        started('c1', 's1'),
        started('c2', 's2'),
      ],
      agentTranscript: async ({ subagentRunId: id }) => [
        {
          role: 'assistant',
          content: id === 's1' ? 'All done.' : '',
          metadata: {
            tanstack: {
              subagent:
                id === 's1'
                  ? { name: 'writer', status: 'finished' }
                  : { name: 'writer', status: 'error', placeholder: true },
            },
          },
        },
      ],
    })
    await view.loadAgent({ id: 's1' })
    await view.loadAgent({ id: 's2' })

    await waitFor(() =>
      expect(view.store.get().messages[0]).toMatchObject({
        parts: [
          { type: 'tool-call', id: 'c1' },
          {
            type: 'agent',
            status: 'done',
            parts: [{ type: 'text', text: 'All done.' }],
          },
          { type: 'tool-call', id: 'c2' },
          // It failed before its first message: only its card is saved.
          { type: 'agent', id: 's2', status: 'failed', parts: [] },
        ],
      }),
    )
  })

  it('shows the later events of a background child that a saved message shows', async () => {
    const { view, stream } = await openView({
      transcript: async () => [
        {
          id: 'm1',
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'c1',
              type: 'function',
              function: { name: 'writer', arguments: '{}' },
            },
          ],
        },
        {
          role: 'tool',
          toolCallId: 'c1',
          content: JSON.stringify({
            subagentRunId: 's1',
            result: { status: 'started' },
          }),
        },
      ],
      agentTranscript: async () => [
        { role: 'assistant', content: 'Found one. ' },
      ],
      snapshot: () => sessionSnapshot({ cursor: '3' }),
    })
    await view.loadAgent({ id: 's1' })
    const child = { subagentRunId: 's1' }

    stream.push(
      entry(4, {
        ...child,
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'c',
        delta: 'Found two.',
      }),
      entry(5, { ...child, type: EventType.SUBAGENT_FINISHED, result: 2 }),
    )

    await waitFor(() =>
      expect(view.store.get().messages[0]).toMatchObject({
        parts: [
          { type: 'tool-call', id: 'c1' },
          {
            type: 'agent',
            id: 's1',
            status: 'done',
            result: 2,
            parts: [{ type: 'text', text: 'Found one. Found two.' }],
          },
        ],
      }),
    )
  })

  it('fills the agent part of a saved agent call from its own messages, only on loadAgent', async () => {
    const asked: Array<string> = []
    const { view } = await openView({
      transcript: async () => [
        {
          id: 'm1',
          role: 'assistant',
          content: null,
          toolCalls: [
            {
              id: 'c1',
              type: 'function',
              function: { name: 'writer', arguments: '{"prompt":"Notes"}' },
            },
          ],
        },
        {
          role: 'tool',
          toolCallId: 'c1',
          content: JSON.stringify({ subagentRunId: 's1', result: 'Note 1' }),
        },
      ],
      agentTranscript: async ({ subagentRunId: id }) => {
        asked.push(id)
        return [
          { role: 'user', content: 'Notes' },
          { role: 'assistant', content: 'Note 1' },
        ]
      },
    })
    await drain()
    // Until it loads, the child shows its card from the saved result.
    expect(asked).toEqual([])
    expect(view.store.get().messages[0]).toMatchObject({
      parts: [{ type: 'tool-call' }, { type: 'agent', id: 's1', parts: [] }],
    })

    await view.loadAgent({ id: 's1' })
    await view.loadAgent({ id: 's1' })

    expect(view.store.get().messages).toMatchObject([
      {
        role: 'assistant',
        parts: [
          { type: 'tool-call', id: 'c1', status: 'done' },
          {
            type: 'agent',
            id: 's1',
            name: 'writer',
            status: 'done',
            parts: [{ type: 'text', text: 'Note 1' }],
          },
        ],
      },
    ])
    expect(asked).toEqual(['s1'])
  })

  it('shows the usage, the models, and the settings, and reads the usage again after a model call', async () => {
    const used = (calls: number) =>
      sessionSnapshot({
        usage: {
          ...emptyUsage(),
          total: { ...emptyUsage().total, calls },
        },
      })
    const snapshot = vi.fn(() => used(2))
    snapshot.mockReturnValueOnce(used(1))
    const { view, stream } = await openView({
      snapshot,
      describe: () => ({
        ...emptyDescription(),
        models: ['fast', 'strong'],
        settings: { model: 'strong' },
      }),
    })

    expect(view.store.get()).toMatchObject({
      usage: { total: { calls: 1 } },
      models: ['fast', 'strong'],
      settings: { model: 'strong' },
    })
    stream.push(custom(HARNESS_EVENTS.usage, { model: 'fast' }))

    await waitFor(() => expect(view.store.get().usage?.total.calls).toBe(2))
  })

  it('adds the next usage call from its event, with its source, and no new snapshot read', async () => {
    const counts = (calls: number) => ({
      ...emptyUsage().total,
      calls,
      totalTokens: calls * 10,
    })
    const snapshot = vi.fn(() =>
      sessionSnapshot({ usage: { ...emptyUsage(), total: counts(1) } }),
    )
    const { view, stream } = await openView({ snapshot })
    const call = { ...counts(1), calls: undefined }
    const usage = (calls: number) =>
      custom(HARNESS_EVENTS.usage, {
        model: 'fast',
        sender: 'ada',
        source: 'plugin:tanstack/title',
        usage: call,
        total: counts(calls),
      })

    // The first call is in the snapshot already (a replay). The second is new.
    stream.push(usage(1), usage(2))
    await drain()

    expect(snapshot).toHaveBeenCalledTimes(1)
    expect(view.store.get().usage).toMatchObject({
      total: { calls: 2, totalTokens: 20 },
      byModel: { fast: { calls: 1, totalTokens: 10 } },
      bySender: { ada: { calls: 1 } },
      bySource: { 'plugin:tanstack/title': { calls: 1 } },
    })
  })

  it('walks only the messages that changed on a commit', async () => {
    const { view, stream } = await openView({
      transcript: async () => [
        { id: 'm0', role: 'assistant', content: 'Old.' },
      ],
    })
    const old = view.store.get().messages[0]
    let reads = 0
    if (old?.role === 'assistant') {
      const { parts } = old
      Object.defineProperty(old, 'parts', {
        get: () => {
          reads += 1
          return parts
        },
      })
    }

    stream.push(says('Hello'), says(' there'))

    await vi.waitFor(() =>
      expect(view.store.get().messages[1]).toMatchObject({
        parts: [{ type: 'text', text: 'Hello there' }],
      }),
    )
    expect(view.store.get().messages[0]).toBe(old)
    expect(reads).toBe(0)
  })
})

describe('session view dispose', () => {
  it('can dispose twice', async () => {
    const { view } = await openView()

    view.dispose()
    view.dispose()

    expect(view.store.get().connection).toBe('closed')
  })

  const afterDispose: Array<{
    action: string
    act: (view: SessionView) => unknown
  }> = [
    { action: 'notice', act: (view) => view.notice({ text: 'hi' }) },
    { action: 'runCommand', act: (view) => view.runCommand({ name: 'ping' }) },
    {
      action: 'setPluginSetting',
      act: (view) => view.setPluginSetting({ key: 'mode', value: 'plan' }),
    },
    { action: 'cancel', act: (view) => view.cancel() },
    { action: 'approveAll', act: (view) => view.approveAll() },
    {
      action: 'question.answer',
      act: (view) => view.store.get().questions[0]?.answer('yes'),
    },
  ]

  it.each(afterDispose)('$action throws after dispose', async ({ act }) => {
    const { view, inputs } = await openView({
      snapshot: () => sessionSnapshot({ questions: [confirm] }),
    })

    view.dispose()

    await expect(async () => act(view)).rejects.toThrow(
      'The session view is disposed.',
    )
    expect(inputs).toEqual([])
  })
})
