import { afterEach, describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai'
import { client } from '@agentclientprotocol/sdk/experimental/v2'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  createHarnessHost,
  defineHarness,
  mediaOfMessage,
} from '@tanstack/ai-harness'
import { createAcpAgent } from '../src/agent'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'
import type {
  ClientContext,
  ContentBlock,
  InitializeResponse,
} from '@agentclientprotocol/sdk/experimental/v2'
import type { MediaOptions, MediaRecord } from '@tanstack/ai-harness'

const now = () => Date.now()

/** Base64 of the four bytes 1, 2, 3, 4. */
const FOUR_BYTES = 'AQIDBA=='

// ponytail: a cut-down copy of the fake model in agent.test.ts. Move the
// copies to one helpers file when a fourth test file needs one.
/** A model that answers "ok" to every call. */
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
    chatStream: () =>
      (async function* (): AsyncGenerator<StreamChunk> {
        yield {
          type: EventType.RUN_STARTED,
          runId: 'r',
          threadId: 't',
          timestamp: now(),
        }
        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'm',
          role: 'assistant',
          timestamp: now(),
        }
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'm',
          delta: 'ok',
          timestamp: now(),
        }
        yield {
          type: EventType.TEXT_MESSAGE_END,
          messageId: 'm',
          timestamp: now(),
        }
        yield {
          type: EventType.RUN_FINISHED,
          runId: 'r',
          threadId: 't',
          timestamp: now(),
          metadata: { tanstack: { finishReason: 'stop' } },
        }
      })(),
  }
}

let close: (() => Promise<void>) | undefined
afterEach(async () => {
  await close?.()
  close = undefined
})

/**
 * A harness with `media` options behind an ACP agent. `connect` runs `run`
 * with an editor that has sent `initialize`, and gives it that answer.
 */
function setup(media?: MediaOptions) {
  const harness = defineHarness({
    name: 'test/acp-media',
    adapter: model(),
    media,
  })
  const host = createHarnessHost({ persistence: memoryPersistence() })
  close = () => host.close()
  const connect = <T>(
    run: (ctx: ClientContext, init: InitializeResponse) => Promise<T>,
  ) =>
    client().connectWith(createAcpAgent({ host, harness }), async (ctx) =>
      run(
        ctx,
        await ctx.request('initialize', {
          protocolVersion: 2,
          info: { name: 'editor', version: '1.0.0' },
        }),
      ),
    )
  return { harness, host, connect }
}

/**
 * Send `prompt` to a new ACP session and wait for the turn. Returns the
 * harness session and the user message the turn saved.
 */
async function savedPrompt(prompt: Array<ContentBlock>) {
  const { harness, host, connect } = setup()
  const sent = await connect(async (ctx) => {
    const { sessionId } = await ctx.request('session/new', {
      cwd: '/tmp',
      mcpServers: [],
    })
    const { messageId } = await ctx.request('session/prompt', {
      sessionId,
      prompt,
    })
    return { sessionId, messageId }
  })
  const session = await host.open(harness, { threadId: sent.sessionId })
  await session.operation(sent.messageId)
  const [user] = await session.transcript()
  if (user?.role !== 'user') throw new Error('The turn saved no user message.')
  return { session, user }
}

describe('ACP agent media', () => {
  it('advertises image, audio, and embedded context prompts in initialize', async () => {
    const { connect } = setup()

    const init = await connect(async (_ctx, answer) => answer)

    expect(init.info).toEqual({ name: 'test/acp-media', version: '0.0.0' })
    expect(init.capabilities).toEqual({
      session: { prompt: { image: {}, audio: {}, embeddedContext: {} } },
    })
  })

  it.each([
    {
      label: 'an image block',
      block: {
        type: 'image',
        data: FOUR_BYTES,
        mimeType: 'image/png',
        uri: 'file:///shots/cat.png',
      },
      stored: { kind: 'image', mimeType: 'image/png', name: 'cat.png' },
    },
    {
      label: 'an audio block',
      block: { type: 'audio', data: FOUR_BYTES, mimeType: 'audio/wav' },
      stored: { kind: 'audio', mimeType: 'audio/wav', name: 'audio' },
    },
    {
      label: 'an embedded blob resource',
      block: {
        type: 'resource',
        resource: {
          uri: 'file:///docs/spec.pdf',
          blob: FOUR_BYTES,
          mimeType: 'application/pdf',
        },
      },
      stored: {
        kind: 'document',
        mimeType: 'application/pdf',
        name: 'spec.pdf',
      },
    },
  ] satisfies Array<{
    label: string
    block: ContentBlock
    stored: Pick<MediaRecord, 'kind' | 'mimeType' | 'name'>
  }>)(
    'stores $label and sends it as a media part',
    async ({ block, stored }) => {
      const { session, user } = await savedPrompt([
        { type: 'text', text: 'What is this?' },
        block,
      ])

      const [record] = mediaOfMessage(user)
      if (!record) throw new Error('The user message has no media record.')
      expect(record).toMatchObject({ ...stored, size: 4, source: 'user' })
      expect(user.content).toEqual([
        { type: 'text', content: 'What is this?' },
        {
          type: stored.kind,
          source: {
            type: 'url',
            value: `harness-media:${record.id}`,
            mimeType: stored.mimeType,
          },
        },
      ])
      expect(await session.loadMedia(record.id)).toEqual(
        new Uint8Array([1, 2, 3, 4]),
      )
    },
  )

  it('sends text resources, resource links, and blobs it cannot store as text', async () => {
    const { user } = await savedPrompt([
      { type: 'text', text: 'Review these.' },
      {
        type: 'resource',
        resource: {
          uri: 'file:///src/a.ts',
          text: 'export const a = 1',
          mimeType: 'text/typescript',
        },
      },
      { type: 'resource_link', name: 'b.ts', uri: 'file:///src/b.ts' },
      {
        type: 'resource',
        resource: {
          uri: 'file:///build.zip',
          blob: FOUR_BYTES,
          mimeType: 'application/zip',
        },
      },
    ])

    expect(user.content).toBe(
      'Review these.\n[resource: file:///src/a.ts]\nexport const a = 1\n[resource link: file:///src/b.ts]\n[resource link: file:///build.zip]',
    )
  })

  it('answers the prompt with an error, and runs no turn, when a file is over the limit', async () => {
    const { harness, host, connect } = setup({ maxBytes: 2 })

    const threadId = await connect(async (ctx) => {
      const { sessionId } = await ctx.request('session/new', {
        cwd: '/tmp',
        mcpServers: [],
      })
      await expect(
        ctx.request('session/prompt', {
          sessionId,
          prompt: [{ type: 'image', data: FOUR_BYTES, mimeType: 'image/png' }],
        }),
      ).rejects.toMatchObject({
        code: -32602,
        message:
          'Invalid params: The file is bigger than the limit of 2 bytes.',
      })
      return sessionId
    })

    const session = await host.open(harness, { threadId })
    expect(await session.transcript()).toEqual([])
  })
})
