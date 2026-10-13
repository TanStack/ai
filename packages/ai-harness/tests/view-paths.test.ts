import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai'
import { HARNESS_EVENTS, createPluginEvent } from '../src'
import { createSessionView } from '../src/view'
import { gate } from './helpers'
import { at, childRun, custom, sessionSnapshot } from './view-fixtures'
import type { Interrupt } from '@tanstack/ai'
import type {
  Cursor,
  HarnessInput,
  Receipt,
  SessionDescription,
  SessionEvent,
} from '../src'
import type { SessionView, SessionViewSource } from '../src/view'

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
    prompt: (message) => accept({ op: 'prompt', message }),
    steer: (message) => accept({ op: 'steer', message }),
    resolve: (resume) => accept({ op: 'resolve', resume }),
    cancel: () => accept({ op: 'cancel' }),
    answer: (questionId, value) => accept({ op: 'answer', questionId, value }),
    command: (name, input) => accept({ op: 'command', name, input }),
    setConfig: (key, value) => accept({ op: 'config', key, value }),
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
  pendingInterrupts: [deleteFile, plain],
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

      await vi.waitFor(() => expect(assistantText(view)).toBe('Still here.'))
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

    await vi.waitFor(() => expect(view.store.get().connection).toBe('closed'))
    expect(errors).toEqual(['socket closed'])
    expect(notices(view)).toEqual([{ kind: 'error', text: 'socket closed' }])
  })

  it('closes when the event stream ends', async () => {
    const { view, stream, errors } = await openView()

    stream.end()

    await vi.waitFor(() => expect(view.store.get().connection).toBe('closed'))
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

    await vi.waitFor(() => expect(stream.closed()).toBe(true))
    expect(calls).toEqual([])
    expect(view.store.get().messages).toEqual([])
  })

  it('reads the snapshot again after a lead run event, not after a child run event', async () => {
    const snapshot = vi.fn(() => sessionSnapshot({ queuedTurns: 1 }))
    snapshot.mockReturnValueOnce(sessionSnapshot())
    const { view, stream } = await openView({ snapshot })

    stream.push(at(childRun.started), at(childRun.finished), runFinished())

    await vi.waitFor(() => expect(view.store.get().queuedTurns).toBe(1))
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
    await vi.waitFor(() => expect(assistantText(view)).toBe('Done.'))
    hold.open()

    await vi.waitFor(() => expect(view.store.get().queuedTurns).toBe(2))
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

    await vi.waitFor(() => expect(errors).toEqual(['snapshot down']))
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

    await vi.waitFor(() =>
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

    await vi.waitFor(() => expect(errors).toEqual(['describe down']))
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
    await vi.waitFor(() => {
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

    await view.setConfig('mode', 'plan')
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
      action: 'setConfig',
      overrides: { setConfig: down },
      act: (view) => view.setConfig('mode', 'plan'),
    },
    {
      action: 'cancel',
      overrides: { cancel: down },
      act: (view) => view.cancel(),
    },
    {
      action: 'a steer',
      overrides: {
        steer: down,
        snapshot: () => sessionSnapshot({ status: 'running' }),
      },
      act: (view) => view.send('faster'),
    },
    {
      action: 'a remote prompt',
      overrides: { prompt: down },
      act: (view) => view.send('hi'),
    },
    {
      action: 'a remote command',
      overrides: { command: down },
      act: (view) => view.send('/ping'),
    },
  ]

  it.each(failingActions)(
    'shows an error notice when $action fails',
    async ({ overrides, act }) => {
      const { view, errors } = await openView(overrides)

      await act(view)

      await vi.waitFor(() =>
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
      prompt: () =>
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
      sessionSnapshot({ pendingInterrupts: [deleteFile, late] }),
    )
    snapshot.mockReturnValueOnce(
      sessionSnapshot({ pendingInterrupts: [deleteFile] }),
    )
    const { view, stream, inputs } = await openView({ snapshot })

    view.approve('late')
    stream.push(runFinished())
    await vi.waitFor(() => expect(view.store.get().approvals).toHaveLength(2))
    view.approve('a')

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

    await vi.waitFor(() => expect(view.store.get().approvals).toHaveLength(2))
    expect(errors).toEqual(['resolve down'])
    expect(snapshot).toHaveBeenCalledTimes(2)
  })
})

describe('session view on()', () => {
  const configDown = () => Promise.reject(new Error('config down'))

  it('stops calling a handler after it unsubscribes', async () => {
    const { view, errors } = await openView({ setConfig: configDown })
    const heard: Array<string> = []
    const stop = view.on('error', (message) => heard.push(message))

    stop()
    await view.setConfig('mode', 'plan')

    expect(errors).toEqual(['config down'])
    expect(heard).toEqual([])
  })

  it('calls the next handler when one throws', async () => {
    const { view } = await openView({ setConfig: configDown })
    const heard: Array<string> = []
    view.on('error', () => {
      throw new Error('broken handler')
    })
    view.on('error', (message) => heard.push(message))

    await view.setConfig('mode', 'plan')

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

    await vi.waitFor(() => expect(pings).toEqual([{ count: 3 }]))
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

    await vi.waitFor(() => expect(agents).toHaveLength(5))
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
      sessionSnapshot({ pendingQuestions: [confirm, named], queuedTurns: 1 }),
    )
    snapshot.mockReturnValueOnce(
      sessionSnapshot({ pendingQuestions: [confirm, named] }),
    )
    const { view, stream, inputs } = startView({ snapshot })
    const asked: Array<string> = []
    view.on('question', (question) => asked.push(question.id))
    await view.ready

    stream.push(runFinished())
    await vi.waitFor(() => expect(view.store.get().queuedTurns).toBe(1))

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

    await vi.waitFor(() => expect(assistantText(view)).toBe('Waiting.'))
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

    await vi.waitFor(() => expect(ended).toEqual(['op-t']))
  })

  it('reports a lead run error and a rejected input, not a child run error', async () => {
    const { stream, errors } = await openView()

    stream.push(
      at(childRun.error),
      custom(HARNESS_EVENTS.inputRejected, { inputId: 'i' }),
      at({ type: EventType.RUN_ERROR, message: 'boom' }),
    )

    await vi.waitFor(() => expect(errors).toHaveLength(2))
    expect(errors).toEqual(['Not accepted: unknown reason', 'Error: boom'])
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
    { action: 'notice', act: (view) => view.notice('hi') },
    { action: 'command', act: (view) => view.command('ping') },
    { action: 'setConfig', act: (view) => view.setConfig('mode', 'plan') },
    { action: 'cancel', act: (view) => view.cancel() },
    { action: 'approveAll', act: (view) => view.approveAll() },
    {
      action: 'question.answer',
      act: (view) => view.store.get().questions[0]?.answer('yes'),
    },
  ]

  it.each(afterDispose)('$action throws after dispose', async ({ act }) => {
    const { view, inputs } = await openView({
      snapshot: () => sessionSnapshot({ pendingQuestions: [confirm] }),
    })

    view.dispose()

    await expect(async () => act(view)).rejects.toThrow(
      'The session view is disposed.',
    )
    expect(inputs).toEqual([])
  })
})
