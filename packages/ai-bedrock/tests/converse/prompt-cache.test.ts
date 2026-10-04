import { describe, expect, it } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { BedrockConverseTextAdapter } from '../../src/adapters/converse-text'
import type {
  ConverseStreamCommandInput,
  ConverseStreamOutput,
} from '@aws-sdk/client-bedrock-runtime'
import type { TextOptions, Tool } from '@tanstack/ai'
import type { BedrockConverseModels } from '../../src/model-meta'

const CLAUDE = 'us.anthropic.claude-sonnet-4-5-20250929-v1:0'
const NOVA = 'us.amazon.nova-pro-v1:0'
const point = { cachePoint: { type: 'default' } }
const longPoint = { cachePoint: { type: 'default', ttl: '1h' } }
const testLogger = resolveDebugOption(false)

/** Keeps the Converse input the adapter sends, with no real AWS call. */
class StubAdapter extends BedrockConverseTextAdapter<BedrockConverseModels> {
  capturedInput?: ConverseStreamCommandInput

  protected override async sendStream(
    input: ConverseStreamCommandInput,
  ): Promise<AsyncIterable<ConverseStreamOutput>> {
    this.capturedInput = input
    const events: Array<ConverseStreamOutput> = [
      { messageStop: { stopReason: 'end_turn' } },
    ]
    return (async function* () {
      for (const event of events) yield event
    })()
  }
}

/**
 * Run one chat request and return the Converse input that was sent. The
 * default request has one system prompt and one user message.
 */
async function sentInput(
  model: BedrockConverseModels,
  overrides: Partial<TextOptions>,
) {
  const adapter = new StubAdapter({ apiKey: 'k' }, model)
  const options: TextOptions = {
    model,
    messages: [{ role: 'user', content: 'hi' }],
    systemPrompts: [{ content: 'stable' }],
    logger: testLogger,
    ...overrides,
  }
  for await (const _chunk of adapter.chatStream(options)) {
    // drain
  }
  return adapter.capturedInput
}

/** All cache point blocks in the system, the messages, and the tools. */
function cachePointCount(input: ConverseStreamCommandInput | undefined) {
  const blocks = [
    ...(input?.system ?? []),
    ...(input?.messages ?? []).flatMap((message) => message.content ?? []),
    ...(input?.toolConfig?.tools ?? []),
  ]
  return blocks.filter((block) => block.cachePoint !== undefined).length
}

const short = { promptCache: { retention: 'short' } } as const
const manualPoint = { cachePoint: { type: 'default' } } as const
const cachedTool: Tool = {
  name: 'lookup',
  description: 'd',
  inputSchema: { type: 'object', properties: {} },
  metadata: manualPoint,
}

describe('Converse automatic prompt cache points', () => {
  it("adds a point to the system prompt and the last user message for Claude with 'short'", async () => {
    const input = await sentInput(CLAUDE, short)

    expect(input?.system).toEqual([{ text: 'stable' }, point])
    expect(input?.messages).toEqual([
      { role: 'user', content: [{ text: 'hi' }, point] },
    ])
  })

  it("adds the 1-hour TTL on both points with 'long'", async () => {
    const input = await sentInput(CLAUDE, {
      promptCache: { retention: 'long' },
    })

    expect(input?.system).toEqual([{ text: 'stable' }, longPoint])
    expect(input?.messages).toEqual([
      { role: 'user', content: [{ text: 'hi' }, longPoint] },
    ])
  })

  it.each<[string, BedrockConverseModels, Partial<TextOptions>]>([
    ["'none' on Claude", CLAUDE, { promptCache: { retention: 'none' } }],
    ['no promptCache on Claude', CLAUDE, {}],
    ["'short' on a non-Claude model", NOVA, short],
  ])('adds no point with %s', async (_name, model, overrides) => {
    const input = await sentInput(model, overrides)

    expect(input?.system).toEqual([{ text: 'stable' }])
    expect(input?.messages).toEqual([
      { role: 'user', content: [{ text: 'hi' }] },
    ])
  })

  it.each<[string, Partial<TextOptions>]>([
    [
      'a system prompt',
      { systemPrompts: [{ content: 'stable', metadata: manualPoint }] },
    ],
    [
      'a message',
      {
        messages: [
          {
            role: 'user',
            content: [{ type: 'text', content: 'hi', metadata: manualPoint }],
          },
        ],
      },
    ],
    ['a tool', { tools: [cachedTool] }],
  ])(
    'adds no point when %s has a manual cache point',
    async (_name, overrides) => {
      const input = await sentInput(CLAUDE, { ...short, ...overrides })

      expect(cachePointCount(input)).toBe(1)
    },
  )

  it('adds only the system point when the last message is from the assistant', async () => {
    const input = await sentInput(CLAUDE, {
      ...short,
      messages: [
        { role: 'user', content: 'hi' },
        { role: 'assistant', content: 'hello' },
      ],
    })

    expect(input?.system).toEqual([{ text: 'stable' }, point])
    expect(input?.messages).toEqual([
      { role: 'user', content: [{ text: 'hi' }] },
      { role: 'assistant', content: [{ text: 'hello' }] },
    ])
  })

  it('adds only the message point when there is no system prompt', async () => {
    const input = await sentInput(CLAUDE, { ...short, systemPrompts: [] })

    expect(input?.system).toBeUndefined()
    expect(input?.messages).toEqual([
      { role: 'user', content: [{ text: 'hi' }, point] },
    ])
  })
})
