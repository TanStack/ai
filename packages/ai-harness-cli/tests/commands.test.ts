import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType, defineAgent } from '@tanstack/ai'
import {
  HARNESS_EVENTS,
  configOption,
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
} from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { HELP_TEXT, handleLine, parseAnswer } from '../src/commands'
import { applyEvent } from '../src/session-view'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'
import type { SessionEvent } from '@tanstack/ai-harness'

/** A model that answers `echo: <text>`, or waits for cancel on "wait". */
function model(): AnyTextAdapter {
  return {
    kind: 'text',
    name: 'mock',
    model: 'test-model',
    '~types': {
      providerOptions: {} as Record<string, unknown>,
      inputModalities: ['text'] as readonly ['text'],
      messageMetadataByModality: {
        text: undefined as unknown,
        image: undefined as unknown,
        audio: undefined as unknown,
        video: undefined as unknown,
        document: undefined as unknown,
      },
      toolCapabilities: [] as ReadonlyArray<string>,
      toolCallMetadata: undefined as unknown,
      systemPromptMetadata: undefined as never,
    },
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
    chatStream: (options: any) =>
      (async function* (): AsyncGenerator<StreamChunk> {
        const said = String(options.messages.at(-1)?.content ?? '')
        const now = Date.now()
        yield {
          type: EventType.RUN_STARTED,
          runId: 'r',
          threadId: 't',
          timestamp: now,
        }
        if (said === 'wait') {
          const signal: AbortSignal | undefined =
            options.abortController?.signal ?? options.request?.signal
          await new Promise<void>((resolve) => {
            if (!signal || signal.aborted) return resolve()
            signal.addEventListener('abort', () => resolve(), { once: true })
          })
          return
        }
        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'm',
          role: 'assistant',
          timestamp: now,
        }
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'm',
          delta: `echo: ${said}`,
          timestamp: now,
        }
        yield {
          type: EventType.TEXT_MESSAGE_END,
          messageId: 'm',
          timestamp: now,
        }
        yield {
          type: EventType.RUN_FINISHED,
          runId: 'r',
          threadId: 't',
          timestamp: now,
          metadata: { tanstack: { finishReason: 'stop' } },
        }
      })(),
  }
}

const tools = definePlugin({
  name: 'test/tools',
  setup: (ctx) => ({
    config: {
      level: configOption.select({ options: ['low', 'high'], default: 'low' }),
    },
    commands: {
      quiet: defineCommand({
        description: 'Returns nothing',
        run: () => undefined,
      }),
      stats: defineCommand({
        description: 'Returns an object',
        run: () => ({ ok: true }),
      }),
      broken: defineCommand({
        description: 'Throws',
        run: () => {
          throw new Error('it broke')
        },
      }),
      echo: defineCommand({
        description: 'Echoes',
        run: (input: unknown) => input,
      }),
      confirm: defineCommand({
        description: 'Asks a yes or no question',
        run: async () => {
          const answer = await ctx.session.ask({
            message: 'Sure?',
            schema: z.boolean(),
          })
          return answer ? 'confirmed' : 'declined'
        },
      }),
      'connect:svc': defineCommand({
        description: 'Sign in',
        run: () => 'Connected to Svc.',
      }),
      'disconnect:svc': defineCommand({
        description: 'Sign out',
        run: () => {
          throw new Error('not signed in')
        },
      }),
    },
  }),
})

const counter = defineAgent({
  name: 'counter',
  description: 'Counts letters',
  inputSchema: z.object({ word: z.string() }),
  run: async (ctx) => ctx.input.word.length,
})

async function open(plugins = true) {
  const host = createHarnessHost({ persistence: memoryPersistence() })
  const session = await host.open(
    defineHarness({
      name: 'test/cli-commands',
      adapter: model(),
      ...(plugins ? { agents: [counter], plugins: () => [tools] } : {}),
    }),
    { threadId: 't' },
  )
  const say = async (line: string) => {
    const result = await handleLine(session, line)
    return result.type === 'notice' ? result.text : result.type
  }
  return { host, session, say }
}

describe('handleLine', () => {
  it('answers built-in commands for a bare harness', async () => {
    const { host, say } = await open(false)
    expect(await say('   ')).toBe('')
    expect(await say('/help')).toBe(HELP_TEXT)
    expect(await say('/config')).toBe('This harness has no settings.')
    expect(await say('/agents')).toBe('This harness has no agents.')
    expect(await say('/cancel')).toBe('Nothing is running.')
    expect(await say('/status')).toBe(
      'Status: idle. Running: nothing. Queued turns: 0.',
    )
    expect(await say('/nope')).toBe('Unknown command: /nope. Type /help.')
    expect(await say('/exit')).toBe('exit')
    expect(await say('/quit')).toBe('exit')
    await host.close()
  })

  it('lists plugin commands, settings, and agents, and changes settings', async () => {
    const { host, say } = await open()
    expect(await say('/help')).toContain('Plugin commands:\n')
    expect(await say('/help')).toContain('/quiet  Returns nothing')
    expect(await say('/config')).toBe('  level = "low"')
    expect(await say('/config level high')).toBe('level changed.')
    expect(await say('/config level extreme')).toMatch(/^Not changed: /)
    expect(await say('/agents')).toBe('  counter: Counts letters')
    await host.close()
  })

  it('runs plugin commands and shows their results or errors', async () => {
    const { host, say } = await open()
    expect(await say('/quiet')).toBe('Done.')
    expect(await say('/stats')).toBe('{\n  "ok": true\n}')
    expect(await say('/broken')).toBe('/broken failed: it broke')
    expect(await say('/echo {"a":1}')).toBe('{\n  "a": 1\n}')
    expect(await say('/echo plain words')).toBe('plain words')
    expect(await say('/connect svc')).toBe('Connected to Svc.')
    expect(await say('/disconnect svc')).toBe(
      '/disconnect:svc failed: not signed in',
    )
    await host.close()
  })

  it('starts agents in the background and checks their input', async () => {
    const { host, say } = await open()
    expect(await say('/agent')).toBe('Unknown agent: (none)')
    expect(await say('/agent ghost')).toBe('Unknown agent: ghost')
    expect(await say('/agent counter {bad')).toContain('must be JSON')
    expect(await say('/agent counter {"word":"four"}')).toBe(
      'Started counter in the background.',
    )
    await host.close()
  })

  it('answers questions, including a rejected answer, then shows the result later', async () => {
    const { host, session } = await open()
    const asked = await handleLine(session, '/confirm')
    expect(asked).toMatchObject({ type: 'notice', text: '' })
    const later = asked.type === 'notice' ? asked.later : undefined
    expect(later).toBeDefined()
    expect(session.snapshot().pendingQuestions).toHaveLength(1)
    expect(await handleLine(session, 'maybe')).toMatchObject({
      text: expect.stringMatching(/^Answer again: /),
    })
    expect(await handleLine(session, 'y')).toMatchObject({ text: '' })
    expect(await later).toBe('confirmed')
    await host.close()
  })

  it('prompts when idle, steers while running, and cancels', async () => {
    const { host, session, say } = await open()
    expect(await say('wait')).toBe('sent')
    await vi.waitFor(() => expect(session.snapshot().status).toBe('running'))
    expect(await say('/status')).toMatch(/^Status: running\. Running: chat/)
    expect(await say('go faster')).toBe('sent')
    expect(await say('/cancel')).toBe('Cancelled.')
    await host.close()
  })
})

describe('parseAnswer', () => {
  it('reads yes and no for boolean questions, JSON, and plain text', () => {
    const boolean = { type: 'boolean' }
    expect(parseAnswer('Yes', boolean)).toBe(true)
    expect(parseAnswer(' n ', boolean)).toBe(false)
    expect(parseAnswer('yes', { type: 'string' })).toBe('yes')
    expect(parseAnswer('{"n":2}', undefined)).toEqual({ n: 2 })
    expect(parseAnswer('', undefined)).toBeUndefined()
  })
})

describe('applyEvent', () => {
  const entry = (event: StreamChunk, operationId = 'op'): SessionEvent => ({
    cursor: '1',
    operationId,
    event,
  })
  const custom = (name: string, value: unknown): StreamChunk => ({
    type: EventType.CUSTOM,
    name,
    value,
    timestamp: 1,
  })

  it('shows questions, sign-ins, resumes, errors, and child agents', () => {
    const events: Array<StreamChunk> = [
      custom(HARNESS_EVENTS.question, { message: 'Sure?' }),
      custom(HARNESS_EVENTS.authRequired, {
        connector: 'gh',
        url: 'https://gh.example/device',
        userCode: 'ABCD',
      }),
      custom(HARNESS_EVENTS.authRequired, { connector: 'svc' }),
      custom(HARNESS_EVENTS.operationResumed, {}),
      { type: EventType.RUN_ERROR, message: 'model down', timestamp: 1 },
      {
        type: EventType.SUBAGENT_STARTED,
        subagentRunId: 'child',
        name: 'painter',
        timestamp: 1,
      } as StreamChunk,
    ]
    const shown = events.reduce(
      (entries, event) => applyEvent(entries, entry(event)),
      [] as ReturnType<typeof applyEvent>,
    )
    expect(shown.map((item) => item.text)).toEqual([
      '? Sure?',
      'Sign in to gh. Open https://gh.example/device and enter the code ABCD.',
      'Sign in to svc. Run /connect svc.',
      'Resumed a turn that a crash stopped.',
      'Error: model down',
      'agent painter started',
    ])
    // Other child events and unknown custom events change nothing.
    const unchanged = applyEvent(
      shown,
      entry({
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'x',
        delta: 'child text',
        subagentRunId: 'child',
        timestamp: 1,
      } as StreamChunk),
    )
    expect(unchanged).toBe(shown)
    expect(applyEvent(shown, entry(custom('other.event', {})))).toBe(shown)
  })
})
