import { afterEach, describe, expect, it, vi } from 'vitest'
import { anthropicText } from '../src/adapters/text'
import { anthropicFiles } from '../src/adapters/files'
import { anthropicSummarize } from '../src/adapters/summarize'
import { createSilentLogger } from './utils/logger'

afterEach(() => vi.unstubAllEnvs())

function captureTransport() {
  const requests: Array<{ url: string; headers: Headers; body: unknown }> = []
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    const body = request.method === 'POST' ? await request.json() : undefined
    requests.push({ url: request.url, headers: request.headers, body })
    if (
      body !== null &&
      typeof body === 'object' &&
      'stream' in body &&
      body.stream === true
    ) {
      const events = [
        {
          type: 'content_block_start',
          index: 0,
          content_block: { type: 'text', text: '' },
        },
        {
          type: 'content_block_delta',
          index: 0,
          delta: { type: 'text_delta', text: 'Summary' },
        },
        { type: 'content_block_stop', index: 0 },
        {
          type: 'message_delta',
          delta: { stop_reason: 'end_turn' },
          usage: { output_tokens: 1 },
        },
        { type: 'message_stop' },
      ]
      return new Response(
        events
          .map(
            (event) =>
              `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
          )
          .join(''),
        { headers: { 'content-type': 'text/event-stream' } },
      )
    }
    if (request.url.includes('/files/')) {
      return Response.json({
        id: 'file_1',
        type: 'file',
        filename: 'notes.txt',
        mime_type: 'text/plain',
        size_bytes: 5,
        created_at: '2026-10-03T00:00:00Z',
        downloadable: true,
      })
    }
    return Response.json({
      id: 'msg_real',
      type: 'message',
      role: 'assistant',
      model: 'claude-sonnet-5-actual',
      content: [
        {
          type: 'tool_use',
          id: 'tool_real',
          name: 'structured_output',
          input: { answer: 'ok' },
        },
      ],
      stop_reason: 'tool_use',
      stop_sequence: null,
      usage: { input_tokens: 2, output_tokens: 3 },
    })
  }
  return { fetch, requests }
}

async function requestWith(config: Parameters<typeof anthropicText>[1]) {
  const transport = captureTransport()
  const adapter = anthropicText('claude-sonnet-5', {
    ...config,
    fetch: transport.fetch,
  })
  const result = await adapter.structuredOutput({
    chatOptions: {
      model: 'claude-sonnet-5',
      messages: [{ role: 'user', content: 'Hello' }],
      modelOptions: { max_tokens: 128 },
      systemPrompts: ['User identity'],
      logger: createSilentLogger(),
    },
    outputSchema: {
      type: 'object',
      properties: { answer: { type: 'string' } },
      required: ['answer'],
    },
  })
  return { ...transport, result }
}

describe('Anthropic authentication transport', () => {
  it('uses a legacy apiKey credential as Bearer when OAuth is forced', async () => {
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'environment-token')
    const { requests, result } = await requestWith({
      apiKey: 'legacy-credential',
      oauth: true,
    })
    expect(requests[0]!.headers.get('authorization')).toBe(
      'Bearer legacy-credential',
    )
    expect(requests[0]!.headers.has('x-api-key')).toBe(false)
    expect(requests[0]!.headers.get('x-app')).toBe('cli')
    expect(result.data).toEqual({ answer: 'ok' })
  })

  it('keeps a detected legacy token as Bearer when OAuth identity is disabled', async () => {
    const { requests, result } = await requestWith({
      apiKey: 'sk-ant-oat-legacy',
      oauth: false,
    })
    expect(requests[0]!.headers.get('authorization')).toBe(
      'Bearer sk-ant-oat-legacy',
    )
    expect(requests[0]!.headers.has('x-api-key')).toBe(false)
    expect(requests[0]!.headers.has('x-app')).toBe(false)
    expect(result.data).toEqual({ answer: 'ok' })
  })

  it('uses forced legacy OAuth credentials for streaming requests', async () => {
    const { fetch, requests } = captureTransport()
    const adapter = anthropicText('claude-sonnet-5', {
      apiKey: 'legacy-stream',
      oauth: true,
      fetch,
    })
    const content = []
    for await (const chunk of adapter.chatStream({
      model: 'claude-sonnet-5',
      messages: [{ role: 'user', content: 'Hello' }],
      logger: createSilentLogger(),
      modelOptions: { max_tokens: 128 },
    })) {
      if (chunk.type === 'TEXT_MESSAGE_CONTENT') content.push(chunk.delta)
    }
    expect(requests[0]!.headers.get('authorization')).toBe(
      'Bearer legacy-stream',
    )
    expect(requests[0]!.headers.has('x-api-key')).toBe(false)
    expect(content.join('')).toBe('Summary')
  })

  it('uses detected legacy token credentials for summarize requests', async () => {
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'environment-token')
    const { fetch, requests } = captureTransport()
    const result = await anthropicSummarize('claude-sonnet-5', {
      apiKey: 'sk-ant-oat-summary',
      fetch,
    }).summarize({
      model: 'claude-sonnet-5',
      text: 'Article',
      modelOptions: { max_tokens: 128 },
      logger: createSilentLogger(),
    })
    expect(requests[0]!.headers.get('authorization')).toBe(
      'Bearer sk-ant-oat-summary',
    )
    expect(requests[0]!.headers.has('x-api-key')).toBe(false)
    expect(requests[0]!.headers.get('x-app')).toBe('cli')
    expect(result.summary).toBe('Summary')
  })
  it('uses an explicit token before environment credentials and adds OAuth identity', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'environment-key')
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'environment-token')
    const { requests, result } = await requestWith({
      authToken: 'sk-ant-oat-explicit',
    })
    const request = requests[0]!
    expect(request.url).toBe('https://api.anthropic.com/v1/messages?beta=true')
    expect(request.headers.get('authorization')).toBe(
      'Bearer sk-ant-oat-explicit',
    )
    expect(request.headers.has('x-api-key')).toBe(false)
    expect(request.headers.get('x-app')).toBe('cli')
    expect(request.headers.get('user-agent')).toBe('claude-cli/2.1.280')
    expect(request.headers.get('anthropic-beta')?.split(',')).toEqual([
      'claude-code-20250219',
      'oauth-2025-04-20',
    ])
    expect(request.body).toEqual({
      model: 'claude-sonnet-5',
      max_tokens: 128,
      messages: [{ role: 'user', content: 'Hello' }],
      system: [
        {
          type: 'text',
          text: "You are Claude Code, Anthropic's official CLI for Claude.",
        },
        { type: 'text', text: 'User identity' },
      ],
      stream: false,
      tools: [
        {
          name: 'structured_output',
          description:
            'Use this tool to provide your response in the required structured format.',
          input_schema: {
            type: 'object',
            properties: { answer: { type: 'string' } },
            required: ['answer'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'structured_output' },
    })
    expect(result.data).toEqual({ answer: 'ok' })
  })

  it('keeps the complete API-key request unchanged and ignores environment tokens', async () => {
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'environment-token')
    const { requests, result } = await requestWith({ apiKey: 'explicit-key' })
    const request = requests[0]!
    expect(request.headers.get('x-api-key')).toBe('explicit-key')
    expect(request.headers.has('authorization')).toBe(false)
    expect(request.headers.has('x-app')).toBe(false)
    expect(request.headers.has('anthropic-beta')).toBe(false)
    expect(request.body).toEqual({
      model: 'claude-sonnet-5',
      max_tokens: 128,
      messages: [{ role: 'user', content: 'Hello' }],
      system: [{ type: 'text', text: 'User identity' }],
      stream: false,
      tools: [
        {
          name: 'structured_output',
          description:
            'Use this tool to provide your response in the required structured format.',
          input_schema: {
            type: 'object',
            properties: { answer: { type: 'string' } },
            required: ['answer'],
          },
        },
      ],
      tool_choice: { type: 'tool', name: 'structured_output' },
    })
    expect(result.data).toEqual({ answer: 'ok' })
  })

  it.each([
    ['ANTHROPIC_AUTH_TOKEN', 'ordinary-token', false],
    ['ANTHROPIC_OAUTH_TOKEN', 'oauth-token', true],
  ])('discovers %s before API keys', async (name, token, oauth) => {
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', '')
    vi.stubEnv('ANTHROPIC_OAUTH_TOKEN', '')
    vi.stubEnv('ANTHROPIC_API_KEY', 'environment-key')
    vi.stubEnv(name, token)
    const { requests, result } = await requestWith({})
    expect(requests[0]!.headers.get('authorization')).toBe(`Bearer ${token}`)
    expect(requests[0]!.headers.has('x-api-key')).toBe(false)
    expect(requests[0]!.headers.has('x-app')).toBe(oauth)
    expect(result.data).toEqual({ answer: 'ok' })
  })

  it('uses explicit OAuth false without adding OAuth identity', async () => {
    const { requests } = await requestWith({
      authToken: 'sk-ant-oat-token',
      oauth: false,
    })
    expect(requests[0]!.headers.get('authorization')).toBe(
      'Bearer sk-ant-oat-token',
    )
    expect(requests[0]!.headers.has('x-app')).toBe(false)
    expect(requests[0]!.headers.has('anthropic-beta')).toBe(false)
  })

  it('keeps caller identity headers and suppresses an API-key header in token mode', async () => {
    const { requests, result } = await requestWith({
      authToken: 'token',
      oauth: true,
      defaultHeaders: {
        'x-app': 'custom-app',
        'user-agent': 'custom-agent',
        'x-api-key': 'wrong-key',
        'anthropic-beta': 'custom-beta',
      },
    })
    expect(requests[0]!.headers.get('x-app')).toBe('custom-app')
    expect(requests[0]!.headers.get('user-agent')).toBe('custom-agent')
    expect(requests[0]!.headers.has('x-api-key')).toBe(false)
    expect(requests[0]!.headers.get('anthropic-beta')?.split(',')).toEqual(
      expect.arrayContaining([
        'custom-beta',
        'claude-code-20250219',
        'oauth-2025-04-20',
      ]),
    )
    expect(result.data).toEqual({ answer: 'ok' })
  })

  it('keeps the API-key Files transport unchanged', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'files-key')
    const { fetch, requests } = captureTransport()
    const file = await anthropicFiles({ fetch }).get('file_1')
    expect(requests[0]!.url).toBe(
      'https://api.anthropic.com/v1/files/file_1?beta=true',
    )
    expect(requests[0]!.headers.get('x-api-key')).toBe('files-key')
    expect(requests[0]!.headers.get('anthropic-beta')).toBe(
      'files-api-2025-04-14,files-api-2025-04-14',
    )
    expect(file).toEqual({
      id: 'file_1',
      provider: 'anthropic',
      mimeType: 'text/plain',
      sizeBytes: 5,
      filename: 'notes.txt',
    })
  })

  it('keeps the complete API-key summarize request unchanged', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'summarize-key')
    const { fetch, requests } = captureTransport()
    const result = await anthropicSummarize('claude-sonnet-5', {
      fetch,
    }).summarize({
      model: 'claude-sonnet-5',
      text: 'Article',
      modelOptions: { max_tokens: 128 },
      logger: createSilentLogger(),
    })
    expect(requests[0]!.headers.get('x-api-key')).toBe('summarize-key')
    expect(requests[0]!.headers.has('authorization')).toBe(false)
    expect(requests[0]!.body).toEqual({
      model: 'claude-sonnet-5',
      max_tokens: 128,
      messages: [{ role: 'user', content: 'Article' }],
      system: [
        {
          type: 'text',
          text: 'You are a professional summarizer. Provide a clear and concise summary. ',
        },
      ],
      temperature: 0.3,
      stream: true,
    })
    expect(result.summary).toBe('Summary')
  })
})
