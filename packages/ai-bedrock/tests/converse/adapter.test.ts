import { describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { BedrockConverseTextAdapter } from '../../src/adapters/converse-text'
import type {
  ConverseCommandOutput,
  ConverseStreamCommandInput,
  ConverseStreamOutput,
} from '@aws-sdk/client-bedrock-runtime'
import type { StreamChunk, TextOptions } from '@tanstack/ai'

/**
 * Subclass that overrides the protected SDK seams so no real AWS call happens.
 * The adapter's translation logic (buildInput, lifecycle wiring) is exercised
 * end-to-end against canned Converse SDK shapes.
 */
class StubAdapter extends BedrockConverseTextAdapter<'us.amazon.nova-pro-v1:0'> {
  streamEvents: Array<ConverseStreamOutput> = []
  nonStreamOutput: ConverseCommandOutput =
    {} as unknown as ConverseCommandOutput
  capturedStreamInput?: ConverseStreamCommandInput

  protected override async sendStream(
    input: ConverseStreamCommandInput,
  ): Promise<AsyncIterable<ConverseStreamOutput>> {
    this.capturedStreamInput = input
    const evs = this.streamEvents
    return (async function* () {
      for (const e of evs) yield e
    })()
  }

  protected override async send(): Promise<ConverseCommandOutput> {
    return this.nonStreamOutput
  }
}

const testLogger = resolveDebugOption(false)

/** Minimal TextOptions for the stub. */
function textOptions(overrides: Partial<TextOptions> = {}): TextOptions {
  return {
    model: 'us.amazon.nova-pro-v1:0',
    messages: [{ role: 'user', content: 'hi' }],
    logger: testLogger,
    ...overrides,
  }
}

describe('BedrockConverseTextAdapter', () => {
  it('exposes name "bedrock-converse" and kind "text"', () => {
    const a = new BedrockConverseTextAdapter(
      { apiKey: 'k' },
      'us.amazon.nova-pro-v1:0',
    )
    expect(a.name).toBe('bedrock-converse')
    expect(a.kind).toBe('text')
  })

  it('streams text through chatStream', async () => {
    const a = new StubAdapter({ apiKey: 'k' }, 'us.amazon.nova-pro-v1:0')
    a.streamEvents = [
      { messageStart: { role: 'assistant' } },
      { contentBlockDelta: { delta: { text: 'hi' }, contentBlockIndex: 0 } },
      { messageStop: { stopReason: 'end_turn' } },
      // SDK boundary: the metadata event requires `metrics` too — narrow the
      // canned shape through `unknown` rather than spell out every field.
      {
        metadata: {
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        },
      } as unknown as ConverseStreamOutput,
    ]
    const types: Array<string> = []
    for await (const c of a.chatStream(textOptions())) {
      types.push(c.type)
    }
    expect(types).toContain(EventType.TEXT_MESSAGE_CONTENT)
    expect(types).toContain(EventType.RUN_FINISHED)
  })

  it('maps modelOptions sampling + stop into Converse inferenceConfig', async () => {
    const a = new StubAdapter({ apiKey: 'k' }, 'us.amazon.nova-pro-v1:0')
    a.streamEvents = [{ messageStop: { stopReason: 'end_turn' } }]
    for await (const _ of a.chatStream(
      textOptions({
        modelOptions: {
          temperature: 0.5,
          top_p: 0.9,
          max_completion_tokens: 128,
          stop: ['STOP'],
        },
      }),
    )) {
      // drain
    }
    expect(a.capturedStreamInput?.inferenceConfig).toEqual({
      temperature: 0.5,
      topP: 0.9,
      maxTokens: 128,
      stopSequences: ['STOP'],
    })
  })

  it('emits RUN_ERROR on an in-band Converse error event', async () => {
    const a = new StubAdapter({ apiKey: 'k' }, 'us.amazon.nova-pro-v1:0')
    a.streamEvents = [
      { messageStart: { role: 'assistant' } },
      {
        contentBlockDelta: { delta: { text: 'partial' }, contentBlockIndex: 0 },
      },
      // In-band server fault Bedrock delivers as a stream event, not a throw.
      {
        throttlingException: new Error('rate limited'),
      } as unknown as ConverseStreamOutput,
    ]
    const errors: Array<{ message?: string }> = []
    for await (const c of a.chatStream(textOptions())) {
      if (c.type === EventType.RUN_ERROR)
        errors.push(c as unknown as { message?: string })
    }
    expect(errors).toHaveLength(1)
    expect(errors[0]?.message).toMatch(/rate limited/)
  })

  it('emits RUN_ERROR when the stream seam throws', async () => {
    class ThrowingAdapter extends BedrockConverseTextAdapter<'us.amazon.nova-pro-v1:0'> {
      protected override async sendStream(): Promise<
        AsyncIterable<ConverseStreamOutput>
      > {
        throw new Error('boom')
      }
      protected override async send(): Promise<ConverseCommandOutput> {
        return {} as unknown as ConverseCommandOutput
      }
    }
    const a = new ThrowingAdapter({ apiKey: 'k' }, 'us.amazon.nova-pro-v1:0')
    const types: Array<string> = []
    for await (const c of a.chatStream(textOptions())) {
      types.push(c.type)
    }
    expect(types).toContain(EventType.RUN_ERROR)
  })

  it('returns parsed object from structuredOutput (forced tool)', async () => {
    const a = new StubAdapter({ apiKey: 'k' }, 'us.amazon.nova-pro-v1:0')
    a.nonStreamOutput = {
      output: {
        message: {
          role: 'assistant',
          content: [
            {
              toolUse: {
                toolUseId: 's',
                name: 'structured_output',
                input: { n: 5 },
              },
            },
          ],
        },
      },
      // SDK boundary: a real ConverseCommandOutput also carries stopReason /
      // usage / metrics / $metadata — narrow through `unknown` for the fixture.
    } as unknown as ConverseCommandOutput
    const res = await a.structuredOutput({
      chatOptions: textOptions({ messages: [{ role: 'user', content: 'go' }] }),
      outputSchema: { type: 'object', properties: { n: { type: 'number' } } },
    })
    expect(res.data).toEqual({ n: 5 })
    expect(JSON.parse(res.rawText)).toEqual({ n: 5 })
  })

  it('streams structured output through structuredOutputStream', async () => {
    const a = new StubAdapter({ apiKey: 'k' }, 'us.amazon.nova-pro-v1:0')
    a.streamEvents = [
      { messageStart: { role: 'assistant' } },
      {
        contentBlockStart: {
          start: { toolUse: { toolUseId: 's', name: 'structured_output' } },
          contentBlockIndex: 0,
        },
      },
      {
        contentBlockDelta: {
          delta: { toolUse: { input: '{"n":5}' } },
          contentBlockIndex: 0,
        },
      },
      { contentBlockStop: { contentBlockIndex: 0 } },
      { messageStop: { stopReason: 'tool_use' } },
    ]
    const events: Array<StreamChunk> = []
    for await (const c of a.structuredOutputStream({
      chatOptions: textOptions({ messages: [{ role: 'user', content: 'go' }] }),
      outputSchema: { type: 'object', properties: { n: { type: 'number' } } },
    })) {
      events.push(c)
    }
    const complete = events.find(
      (e): e is Extract<StreamChunk, { type: typeof EventType.CUSTOM }> =>
        e.type === EventType.CUSTOM &&
        'name' in e &&
        e.name === 'structured-output.complete',
    )
    expect(complete).toBeDefined()
    expect((complete?.value as { object: unknown }).object).toEqual({ n: 5 })
    // The forced-tool 'tool_use' stopReason is internal — a clean structured
    // run reports 'stop', not 'tool_calls'.
    const finished = events.find((e) => e.type === EventType.RUN_FINISHED)
    expect(
      (finished as { finishReason?: string } | undefined)?.finishReason,
    ).toBe('stop')
  })

  it('rejects a non-forced tool-use block in structuredOutput', async () => {
    const a = new StubAdapter({ apiKey: 'k' }, 'us.amazon.nova-pro-v1:0')
    // The model emitted a different (hallucinated/leftover) tool — its input
    // must NOT be returned as the structured result; structuredOutput throws.
    a.nonStreamOutput = {
      output: {
        message: {
          role: 'assistant',
          content: [
            {
              toolUse: {
                toolUseId: 'x',
                name: 'some_other_tool',
                input: { wrong: true },
              },
            },
          ],
        },
      },
    } as unknown as ConverseCommandOutput
    await expect(
      a.structuredOutput({
        chatOptions: textOptions({
          messages: [{ role: 'user', content: 'go' }],
        }),
        outputSchema: { type: 'object', properties: { n: { type: 'number' } } },
      }),
    ).rejects.toThrow(/no forced-tool output/)
  })

  it('emits RUN_ERROR(empty-response) when structuredOutputStream yields no content', async () => {
    const a = new StubAdapter({ apiKey: 'k' }, 'us.amazon.nova-pro-v1:0')
    a.streamEvents = [
      { messageStart: { role: 'assistant' } },
      { messageStop: { stopReason: 'end_turn' } },
    ]
    const errors = [] as Array<{ code?: string }>
    for await (const c of a.structuredOutputStream({
      chatOptions: textOptions({ messages: [{ role: 'user', content: 'go' }] }),
      outputSchema: { type: 'object', properties: { n: { type: 'number' } } },
    })) {
      if (c.type === EventType.RUN_ERROR)
        errors.push(c as unknown as { code?: string })
    }
    expect(errors).toHaveLength(1)
    expect(errors[0]?.code).toBe('empty-response')
  })

  it('emits RUN_ERROR(parse-error) when structuredOutputStream content is invalid JSON', async () => {
    const a = new StubAdapter({ apiKey: 'k' }, 'us.amazon.nova-pro-v1:0')
    a.streamEvents = [
      { messageStart: { role: 'assistant' } },
      {
        contentBlockStart: {
          start: { toolUse: { toolUseId: 's', name: 'structured_output' } },
          contentBlockIndex: 0,
        },
      },
      {
        contentBlockDelta: {
          // Truncated/invalid JSON fragment — JSON.parse will throw.
          delta: { toolUse: { input: '{"n":' } },
          contentBlockIndex: 0,
        },
      },
      { messageStop: { stopReason: 'tool_use' } },
    ]
    const errors = [] as Array<{ code?: string }>
    for await (const c of a.structuredOutputStream({
      chatOptions: textOptions({ messages: [{ role: 'user', content: 'go' }] }),
      outputSchema: { type: 'object', properties: { n: { type: 'number' } } },
    })) {
      if (c.type === EventType.RUN_ERROR)
        errors.push(c as unknown as { code?: string })
    }
    expect(errors).toHaveLength(1)
    expect(errors[0]?.code).toBe('parse-error')
  })

  it('prefers the bearer auth scheme for a token (SDK defaults to SigV4 otherwise)', () => {
    class Probe extends BedrockConverseTextAdapter<'us.amazon.nova-pro-v1:0'> {
      bearer(token: string) {
        return this.buildClientConfig(
          { kind: 'bearer' as const, token },
          'us-east-1',
          undefined,
        )
      }
    }
    const a = new Probe({ apiKey: 'k' }, 'us.amazon.nova-pro-v1:0')
    const cfg = a.bearer('ABSK-test-token')
    // Without authSchemePreference the SDK tries SigV4 first and the token is
    // ignored — this is the contract that keeps API-key auth working.
    expect(cfg.authSchemePreference).toEqual(['httpBearerAuth'])
    expect(cfg.token).toEqual({ token: 'ABSK-test-token' })
  })

  it('declares it does not support combined tools and schema', () => {
    const a = new BedrockConverseTextAdapter(
      { apiKey: 'k' },
      'us.amazon.nova-pro-v1:0',
    )
    expect(a.supportsCombinedToolsAndSchema()).toBe(false)
  })
})
