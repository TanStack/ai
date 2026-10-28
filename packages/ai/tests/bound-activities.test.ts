import { afterEach, describe, expect, it, vi } from 'vitest'
import { collectChunks, createMockAdapter } from './test-utils'
import type { GenerationMiddleware } from '../src/activities/middleware/types'
import type { ChatMiddleware } from '../src/activities/chat/middleware/types'
import type { SubagentBinding } from '../src/activities/chat/agents/bound'
import type { DebugOption, Logger } from '../src/logger/types'

// Replace every activity with a spy that returns the options it got, so the
// test sees exactly what each bound wrapper passes on.
const record = (name: string) =>
  vi.fn((options: unknown) => ({ name, options }))
vi.mock('../src/activities/chat/index', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  chat: record('chat'),
}))
vi.mock('../src/activities/summarize/index', () => ({
  summarize: record('summarize'),
}))
vi.mock('../src/activities/generateImage/index', () => ({
  generateImage: record('image'),
}))
vi.mock('../src/activities/generateVideo/index', () => ({
  generateVideo: record('video'),
}))
vi.mock('../src/activities/generateAudio/index', () => ({
  generateAudio: record('audio'),
}))
vi.mock('../src/activities/generateSpeech/index', () => ({
  generateSpeech: record('speech'),
}))
vi.mock('../src/activities/generateVoice/index', () => ({
  generateVoice: record('voice'),
}))
vi.mock('../src/activities/generateTranscription/index', () => ({
  generateTranscription: record('transcription'),
}))
vi.mock('../src/activities/generateWorld/index', () => ({
  generateWorld: record('world'),
}))
vi.mock('../src/activities/generateLiveVideo/index', () => ({
  generateLiveVideo: record('liveVideo'),
}))
vi.mock('../src/activities/embed/index', () => ({ embed: record('embed') }))
vi.mock('../src/activities/rerank/index', () => ({ rerank: record('rerank') }))
vi.mock('../src/activities/evaluate/index', () => ({
  decide: record('decide'),
}))

const { createBoundActivities } =
  await import('../src/activities/chat/agents/bound')
const { chat: mockedChat } = await import('../src/activities/chat/index')
// The real chat, for the tests that run a child chat call to its end.
const { chat: actualChat } = await vi.importActual<{
  chat: typeof mockedChat
}>('../src/activities/chat/index')

const input = {
  input: undefined,
  messages: [{ role: 'user' as const, content: 'hi' }],
  threadId: 'thread-1',
  runId: 'run-1',
  parentRunId: 'parent-1',
  subagentRunId: 'child-1',
}

// The spies return this record, not the real return type. That is why each
// bound function is cast to one that returns `Recorded` before the call.
type Recorded = { name: string; options: Record<string, any> }

type Activity = keyof ReturnType<typeof createBoundActivities>

// Each activity that takes ids, and the name its run ids use.
const idActivities: Array<[Activity, string]> = [
  ['summarize', 'summarize'],
  ['generateImage', 'image'],
  ['generateVideo', 'video'],
  ['generateAudio', 'audio'],
  ['generateSpeech', 'speech'],
  ['generateVoice', 'voice'],
  ['generateTranscription', 'transcription'],
  ['generateWorld', 'world'],
  ['generateLiveVideo', 'liveVideo'],
]

/** A logger that keeps each line as `[level, message]`. */
function recordingLogger() {
  const lines: Array<[keyof Logger, string]> = []
  const logger: Logger = {
    debug: (message) => lines.push(['debug', message]),
    info: (message) => lines.push(['info', message]),
    warn: (message) => lines.push(['warn', message]),
    error: (message) => lines.push(['error', message]),
  }
  return { logger, lines }
}

/** The `debug` option that sends only the `errors` category to `logger`. */
const errorsOnly = (logger: Logger) => ({
  logger,
  errors: true,
  provider: false,
  output: false,
  middleware: false,
  tools: false,
  agentLoop: false,
  config: false,
  request: false,
  sandbox: false,
})

/** Runs one child chat call through the real chat. Its model call throws. */
async function failChildChat(binding: SubagentBinding, debug?: DebugOption) {
  const { adapter } = createMockAdapter({
    chatStreamFn: () =>
      (async function* () {
        throw new Error('boom')
      })(),
  })
  const activities = createBoundActivities(
    'helper',
    input,
    new AbortController(),
    binding,
  )
  vi.mocked(mockedChat).mockImplementationOnce(actualChat)
  await expect(
    collectChunks(activities.chat({ adapter, debug })),
  ).rejects.toThrow('boom')
}

// The line that the errors category logs when the model call of a chat throws.
const chatRunFailed = ['error', expect.stringContaining('chat run failed')]

describe('createBoundActivities', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  const generationMiddleware: Array<GenerationMiddleware> = [
    { name: 'host-generation' },
  ]
  const chatMiddleware: Array<ChatMiddleware> = [{ name: 'host-chat' }]
  const lastChatMiddleware: Array<ChatMiddleware> = [{ name: 'host-last' }]

  function bound() {
    const controller = new AbortController()
    const activities = createBoundActivities('helper', input, controller, {
      chatMiddleware,
      lastChatMiddleware,
      generationMiddleware,
    })
    return { activities, controller }
  }

  it('gives every id-taking activity its own run id, the thread, the signal, and host middleware first', () => {
    const { activities, controller } = bound()
    const own = { name: 'own' }
    idActivities.forEach(([method, activity], index) => {
      const call = activities[method] as unknown as (
        options: object,
      ) => Recorded
      const result = call({ prompt: 'x', middleware: [own] })
      expect(result.name).toBe(activity)
      expect(result.options).toMatchObject({
        threadId: 'thread-1',
        runId: `run-1:${activity}-${index + 1}`,
        abortSignal: controller.signal,
        prompt: 'x',
      })
      expect(result.options.middleware).toEqual([...generationMiddleware, own])
    })
  })

  it('lets a generation call pass its own threadId', () => {
    const { activities } = bound()
    const call = activities.generateImage as unknown as (
      options: object,
    ) => Recorded
    expect(call({ prompt: 'x', threadId: 'mine' }).options.threadId).toBe(
      'mine',
    )
  })

  it('passes only middleware to embed, and the signal plus middleware to rerank and decide', () => {
    const { activities, controller } = bound()
    const embed = (
      activities.embed as unknown as (options: object) => Recorded
    )({ input: 'x' })
    expect(embed.options).toEqual({
      input: 'x',
      middleware: generationMiddleware,
    })

    for (const method of ['rerank', 'decide'] as const) {
      const call = activities[method] as unknown as (
        options: object,
      ) => Recorded
      const result = call({ query: 'q' })
      expect(result.options).toEqual({
        query: 'q',
        abortSignal: controller.signal,
        middleware: generationMiddleware,
      })
    }
  })

  it('fills chat with the child ids and messages, and lets options win', () => {
    const { activities, controller } = bound()
    const chat = activities.chat as unknown as (options: object) => Recorded
    const defaults = chat({ adapter: 'a' })
    expect(defaults.options).toMatchObject({
      messages: input.messages,
      threadId: 'thread-1',
      runId: 'run-1',
      parentRunId: 'parent-1',
      subagentRunId: 'child-1',
      subagentName: 'helper',
      abortController: controller,
      middleware: [...chatMiddleware, ...lastChatMiddleware],
    })
    // The host's last middleware runs after the call's own.
    const own = { name: 'own' }
    expect(
      chat({ adapter: 'a', middleware: [own] }).options.middleware,
    ).toEqual([...chatMiddleware, own, ...lastChatMiddleware])
    const custom = chat({ adapter: 'a', messages: [], threadId: 'mine' })
    expect(custom.options).toMatchObject({
      messages: [],
      threadId: 'mine',
      // A second chat call is its own run.
      runId: 'run-1:chat-3',
    })
  })

  it('gives nested children the host middleware first, then their own, and the host last middleware at the end', () => {
    const { activities } = bound()
    const chat = activities.chat as unknown as (options: object) => Recorded
    const own = { name: 'own' }
    const nested = chat({
      adapter: 'a',
      subagents: {
        agents: [],
        binding: {
          chatMiddleware: [own],
          lastChatMiddleware: [own],
          generationMiddleware: [own],
        },
      },
    })
    expect(nested.options.subagents.binding).toEqual({
      chatMiddleware: [...chatMiddleware, own],
      lastChatMiddleware: [own, ...lastChatMiddleware],
      generationMiddleware: [...generationMiddleware, own],
    })
  })

  it('adds the host interrupts to chat, and the own interrupts of the call win on an id clash', () => {
    const approval = { id: 'host:approval', from: 'host' }
    const question = { id: 'host:question', from: 'host' }
    const ownQuestion = { id: 'host:question', from: 'own' }
    const review = { id: 'own:review', from: 'own' }
    const activities = createBoundActivities(
      'helper',
      input,
      new AbortController(),
      { interrupts: [approval, question] as never },
    )
    const chat = activities.chat as unknown as (options: object) => Recorded
    expect(chat({ adapter: 'a' }).options.interrupts).toEqual([
      approval,
      question,
    ])
    expect(
      chat({ adapter: 'a', interrupts: [ownQuestion, review] }).options
        .interrupts,
    ).toEqual([approval, ownQuestion, review])
    // Nested children get them too, after the same rule.
    const nested = chat({
      adapter: 'a',
      subagents: { agents: [], binding: { interrupts: [review] } },
    })
    expect(nested.options.subagents.binding.interrupts).toEqual([
      approval,
      question,
      review,
    ])
  })

  it('sends the errors of a child chat call to the host debug logger', async () => {
    const host = recordingLogger()
    await failChildChat({ debug: errorsOnly(host.logger) })
    expect(host.lines).toEqual([chatRunFailed])
  })

  it('keeps the own debug of a child chat call', async () => {
    const host = recordingLogger()
    const own = recordingLogger()
    const binding = { debug: errorsOnly(host.logger) }
    await failChildChat(binding, errorsOnly(own.logger))
    // `false` silences the call, so the host logger gets nothing from it.
    await failChildChat(binding, false)
    expect(own.lines).toEqual([chatRunFailed])
    expect(host.lines).toEqual([])
  })

  it('logs the errors of a child chat call to the console when the host sets no debug', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    // On Node the default logger prints the meta of a line with `console.dir`.
    vi.spyOn(console, 'dir').mockImplementation(() => {})
    await failChildChat({})
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('chat run failed'),
    )
  })

  it('gives every generation call the host debug, unless the call sets its own', () => {
    const debug = { errors: true }
    const activities = createBoundActivities(
      'helper',
      input,
      new AbortController(),
      { debug },
    )
    const methods: Array<Activity> = [
      ...idActivities.map(([method]) => method),
      'embed',
      'rerank',
      'decide',
    ]
    for (const method of methods) {
      const call = activities[method] as unknown as (
        options: object,
      ) => Recorded
      expect(call({ prompt: 'x' }).options.debug).toBe(debug)
      expect(call({ prompt: 'x', debug: false }).options.debug).toBe(false)
    }
  })

  it('passes the host debug down to nested children, unless the call sets its own', () => {
    const activities = createBoundActivities(
      'helper',
      input,
      new AbortController(),
      { debug: true },
    )
    const chat = activities.chat as unknown as (options: object) => Recorded
    const nestedDebug = (binding?: SubagentBinding) =>
      chat({ adapter: 'a', subagents: { agents: [], binding } }).options
        .subagents.binding.debug
    expect(nestedDebug()).toBe(true)
    expect(nestedDebug({ debug: false })).toBe(false)
  })

  it('works without a binding', () => {
    const activities = createBoundActivities(
      'helper',
      input,
      new AbortController(),
    )
    const result = (
      activities.generateImage as unknown as (options: object) => Recorded
    )({ prompt: 'x' })
    expect(result.options.middleware).toEqual([])
    // No host debug: the activity keeps its own default.
    expect(result.options.debug).toBeUndefined()
  })
})
