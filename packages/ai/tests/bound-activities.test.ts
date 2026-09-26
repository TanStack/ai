import { describe, expect, it, vi } from 'vitest'

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

const input = {
  input: undefined,
  messages: [{ role: 'user' as const, content: 'hi' }],
  threadId: 'thread-1',
  runId: 'run-1',
  parentRunId: 'parent-1',
  subagentRunId: 'child-1',
}

type Recorded = { name: string; options: Record<string, any> }

describe('createBoundActivities', () => {
  const generationMiddleware = [{ name: 'host-generation' }]
  const chatMiddleware = [{ name: 'host-chat' }]

  function bound() {
    const controller = new AbortController()
    const activities = createBoundActivities(input, controller, {
      chatMiddleware: chatMiddleware as never,
      generationMiddleware: generationMiddleware as never,
    })
    return { activities, controller }
  }

  it('gives every id-taking activity its own run id, the thread, the signal, and host middleware first', () => {
    const { activities, controller } = bound()
    const own = { name: 'own' }
    const calls: Array<[keyof typeof activities, string]> = [
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
    calls.forEach(([method, activity], index) => {
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
      abortController: controller,
      middleware: chatMiddleware,
    })
    const custom = chat({ adapter: 'a', messages: [], threadId: 'mine' })
    expect(custom.options).toMatchObject({ messages: [], threadId: 'mine' })
  })

  it('works without a binding', () => {
    const activities = createBoundActivities(input, new AbortController())
    const result = (
      activities.generateImage as unknown as (options: object) => Recorded
    )({ prompt: 'x' })
    expect(result.options.middleware).toEqual([])
  })
})
