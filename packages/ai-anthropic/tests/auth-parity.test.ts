import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { anthropicText, createAnthropicChat } from '../src/adapters/text'
import { anthropicFiles, createAnthropicFiles } from '../src/adapters/files'
import {
  anthropicSummarize,
  createAnthropicSummarize,
} from '../src/adapters/summarize'
import { createSilentLogger } from './utils/logger'

// Every test starts with no Anthropic credential in the environment.
beforeEach(() => {
  vi.stubEnv('ANTHROPIC_AUTH_TOKEN', '')
  vi.stubEnv('ANTHROPIC_OAUTH_TOKEN', '')
  vi.stubEnv('ANTHROPIC_API_KEY', '')
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

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

const STRUCTURED_OUTPUT_TOOL = {
  name: 'structured_output',
  description:
    'Use this tool to provide your response in the required structured format.',
  input_schema: {
    type: 'object',
    properties: { answer: { type: 'string' } },
    required: ['answer'],
  },
}

const CLAUDE_CODE_BLOCK = {
  type: 'text',
  text: "You are Claude Code, Anthropic's official CLI for Claude.",
}

/** Sends one structured-output request through the adapter that `make` builds. */
async function send(
  make: (
    fetch: typeof globalThis.fetch,
  ) => ReturnType<typeof createAnthropicChat<'claude-sonnet-5'>>,
) {
  const transport = captureTransport()
  const result = await make(transport.fetch).structuredOutput({
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
  expect(result.data).toEqual({ answer: 'ok' })
  expect(transport.requests).toHaveLength(1)
  return transport.requests[0]!
}

function authOf(request: { headers: Headers }) {
  return {
    authorization: request.headers.get('authorization'),
    xApiKey: request.headers.get('x-api-key'),
    xApp: request.headers.get('x-app'),
    anthropicBeta: request.headers.get('anthropic-beta'),
  }
}

describe('createAnthropicChat', () => {
  it('sends the explicit key as x-api-key and ignores the environment', async () => {
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'environment-token')
    vi.stubEnv('ANTHROPIC_OAUTH_TOKEN', 'environment-oauth')
    vi.stubEnv('ANTHROPIC_API_KEY', 'environment-key')
    const request = await send((fetch) =>
      createAnthropicChat('claude-sonnet-5', 'explicit-key', { fetch }),
    )
    expect(request.url).toBe('https://api.anthropic.com/v1/messages?beta=true')
    expect(authOf(request)).toEqual({
      authorization: null,
      xApiKey: 'explicit-key',
      xApp: null,
      anthropicBeta: null,
    })
    expect(request.body).toEqual({
      model: 'claude-sonnet-5',
      max_tokens: 128,
      messages: [{ role: 'user', content: 'Hello' }],
      system: [{ type: 'text', text: 'User identity' }],
      stream: false,
      tools: [STRUCTURED_OUTPUT_TOOL],
      tool_choice: { type: 'tool', name: 'structured_output' },
    })
  })

  it('does not fall back to the environment for an empty credential', async () => {
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'environment-token')
    vi.stubEnv('ANTHROPIC_API_KEY', 'environment-key')
    const { fetch, requests } = captureTransport()
    await expect(
      createAnthropicChat('claude-sonnet-5', '', { fetch }).structuredOutput({
        chatOptions: {
          model: 'claude-sonnet-5',
          messages: [{ role: 'user', content: 'Hello' }],
          modelOptions: { max_tokens: 128 },
          logger: createSilentLogger(),
        },
        outputSchema: { type: 'object' },
      }),
    ).rejects.toThrow('Could not resolve authentication method')
    expect(requests).toHaveLength(0)
  })

  it("sends auth: 'bearer' as Authorization: Bearer without the Claude Code extras", async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'environment-key')
    const request = await send((fetch) =>
      createAnthropicChat('claude-sonnet-5', 'bearer-token', {
        auth: 'bearer',
        fetch,
      }),
    )
    expect(authOf(request)).toEqual({
      authorization: 'Bearer bearer-token',
      xApiKey: null,
      xApp: null,
      anthropicBeta: null,
    })
    expect(request.body).toMatchObject({
      system: [{ type: 'text', text: 'User identity' }],
    })
  })

  it('detects OAuth for an sk-ant-oat credential', async () => {
    const request = await send((fetch) =>
      createAnthropicChat('claude-sonnet-5', 'sk-ant-oat-explicit', { fetch }),
    )
    expect(authOf(request)).toEqual({
      authorization: 'Bearer sk-ant-oat-explicit',
      xApiKey: null,
      xApp: 'cli',
      anthropicBeta: 'claude-code-20250219,oauth-2025-04-20',
    })
    expect(request.headers.get('user-agent')).toBe('claude-cli/2.1.280')
    expect(request.body).toEqual({
      model: 'claude-sonnet-5',
      max_tokens: 128,
      messages: [{ role: 'user', content: 'Hello' }],
      system: [CLAUDE_CODE_BLOCK, { type: 'text', text: 'User identity' }],
      stream: false,
      tools: [STRUCTURED_OUTPUT_TOOL],
      tool_choice: { type: 'tool', name: 'structured_output' },
    })
  })

  it('lets an explicit auth win over the detected kind', async () => {
    const bearer = await send((fetch) =>
      createAnthropicChat('claude-sonnet-5', 'sk-ant-oat-token', {
        auth: 'bearer',
        fetch,
      }),
    )
    expect(authOf(bearer)).toEqual({
      authorization: 'Bearer sk-ant-oat-token',
      xApiKey: null,
      xApp: null,
      anthropicBeta: null,
    })

    const oauth = await send((fetch) =>
      createAnthropicChat('claude-sonnet-5', 'plain-token', {
        auth: 'oauth',
        fetch,
      }),
    )
    expect(authOf(oauth)).toEqual({
      authorization: 'Bearer plain-token',
      xApiKey: null,
      xApp: 'cli',
      anthropicBeta: 'claude-code-20250219,oauth-2025-04-20',
    })
  })

  it("uses auth: 'oauth' for streaming requests", async () => {
    const { fetch, requests } = captureTransport()
    const adapter = createAnthropicChat('claude-sonnet-5', 'stream-token', {
      auth: 'oauth',
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
    expect(authOf(requests[0]!)).toEqual({
      authorization: 'Bearer stream-token',
      xApiKey: null,
      xApp: 'cli',
      anthropicBeta: 'claude-code-20250219,oauth-2025-04-20',
    })
    expect(content.join('')).toBe('Summary')
  })

  it('keeps caller identity headers and drops a caller x-api-key in OAuth mode', async () => {
    const request = await send((fetch) =>
      createAnthropicChat('claude-sonnet-5', 'token', {
        auth: 'oauth',
        fetch,
        defaultHeaders: {
          'x-app': 'custom-app',
          'user-agent': 'custom-agent',
          'x-api-key': 'wrong-key',
          'anthropic-beta': 'custom-beta',
        },
      }),
    )
    expect(request.headers.get('x-app')).toBe('custom-app')
    expect(request.headers.get('user-agent')).toBe('custom-agent')
    expect(request.headers.has('x-api-key')).toBe(false)
    expect(request.headers.get('anthropic-beta')?.split(',')).toEqual(
      expect.arrayContaining([
        'custom-beta',
        'claude-code-20250219',
        'oauth-2025-04-20',
      ]),
    )
  })
})

describe('anthropicText', () => {
  it.each([
    [
      'ANTHROPIC_AUTH_TOKEN as bearer',
      { ANTHROPIC_AUTH_TOKEN: 'auth-token', ANTHROPIC_OAUTH_TOKEN: 'oauth' },
      { authorization: 'Bearer auth-token', xApiKey: null, xApp: null },
    ],
    [
      'an sk-ant-oat ANTHROPIC_AUTH_TOKEN as oauth',
      { ANTHROPIC_AUTH_TOKEN: 'sk-ant-oat-env', ANTHROPIC_API_KEY: 'key' },
      { authorization: 'Bearer sk-ant-oat-env', xApiKey: null, xApp: 'cli' },
    ],
    [
      'ANTHROPIC_OAUTH_TOKEN as oauth',
      { ANTHROPIC_OAUTH_TOKEN: 'oauth-token', ANTHROPIC_API_KEY: 'key' },
      { authorization: 'Bearer oauth-token', xApiKey: null, xApp: 'cli' },
    ],
    [
      'ANTHROPIC_API_KEY as api-key',
      { ANTHROPIC_API_KEY: 'environment-key' },
      { authorization: null, xApiKey: 'environment-key', xApp: null },
    ],
  ])('reads %s', async (_name, env, expected) => {
    for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value)
    const request = await send((fetch) =>
      anthropicText('claude-sonnet-5', { fetch }),
    )
    expect(authOf(request)).toMatchObject(expected)
  })

  it('lets config.auth win over the kind read from the environment', async () => {
    vi.stubEnv('ANTHROPIC_OAUTH_TOKEN', 'oauth-token')
    const request = await send((fetch) =>
      anthropicText('claude-sonnet-5', { auth: 'bearer', fetch }),
    )
    expect(authOf(request)).toEqual({
      authorization: 'Bearer oauth-token',
      xApiKey: null,
      xApp: null,
      anthropicBeta: null,
    })
  })

  it('reads window.env when it exists', async () => {
    vi.stubGlobal('window', { env: { ANTHROPIC_API_KEY: 'window-key' } })
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'process-token')
    const request = await send((fetch) =>
      anthropicText('claude-sonnet-5', { fetch }),
    )
    expect(authOf(request)).toMatchObject({
      authorization: null,
      xApiKey: 'window-key',
    })
  })

  it('throws when no credential is set', () => {
    expect(() => anthropicText('claude-sonnet-5')).toThrow(
      'ANTHROPIC_AUTH_TOKEN, ANTHROPIC_OAUTH_TOKEN, and ANTHROPIC_API_KEY are not set',
    )
  })
})

describe('summarize factories', () => {
  it('createAnthropicSummarize detects OAuth and ignores the environment', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'environment-key')
    const { fetch, requests } = captureTransport()
    const result = await createAnthropicSummarize(
      'claude-sonnet-5',
      'sk-ant-oat-summary',
      { fetch },
    ).summarize({
      model: 'claude-sonnet-5',
      text: 'Article',
      modelOptions: { max_tokens: 128 },
      logger: createSilentLogger(),
    })
    expect(authOf(requests[0]!)).toEqual({
      authorization: 'Bearer sk-ant-oat-summary',
      xApiKey: null,
      xApp: 'cli',
      anthropicBeta: 'claude-code-20250219,oauth-2025-04-20',
    })
    expect(result.summary).toBe('Summary')
  })

  it('anthropicSummarize sends ANTHROPIC_API_KEY and keeps the request unchanged', async () => {
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
    expect(authOf(requests[0]!)).toMatchObject({
      authorization: null,
      xApiKey: 'summarize-key',
    })
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

  it('anthropicSummarize sends ANTHROPIC_AUTH_TOKEN as Bearer', async () => {
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'summary-token')
    vi.stubEnv('ANTHROPIC_API_KEY', 'summarize-key')
    const { fetch, requests } = captureTransport()
    await anthropicSummarize('claude-sonnet-5', { fetch }).summarize({
      model: 'claude-sonnet-5',
      text: 'Article',
      modelOptions: { max_tokens: 128 },
      logger: createSilentLogger(),
    })
    expect(authOf(requests[0]!)).toMatchObject({
      authorization: 'Bearer summary-token',
      xApiKey: null,
      xApp: null,
    })
  })
})

describe('files factories', () => {
  const FILE = {
    id: 'file_1',
    provider: 'anthropic',
    mimeType: 'text/plain',
    sizeBytes: 5,
    filename: 'notes.txt',
  }

  it("createAnthropicFiles sends auth: 'bearer' and ignores the environment", async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'environment-key')
    const { fetch, requests } = captureTransport()
    const file = await createAnthropicFiles('files-token', {
      auth: 'bearer',
      fetch,
    }).get('file_1')
    expect(requests[0]!.url).toBe(
      'https://api.anthropic.com/v1/files/file_1?beta=true',
    )
    expect(authOf(requests[0]!)).toMatchObject({
      authorization: 'Bearer files-token',
      xApiKey: null,
    })
    expect(file).toEqual(FILE)
  })

  it('anthropicFiles sends ANTHROPIC_API_KEY as x-api-key', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'files-key')
    const { fetch, requests } = captureTransport()
    const file = await anthropicFiles({ fetch }).get('file_1')
    expect(authOf(requests[0]!)).toEqual({
      authorization: null,
      xApiKey: 'files-key',
      xApp: null,
      anthropicBeta: 'files-api-2025-04-14,files-api-2025-04-14',
    })
    expect(file).toEqual(FILE)
  })

  it('anthropicFiles sends ANTHROPIC_OAUTH_TOKEN as Bearer', async () => {
    vi.stubEnv('ANTHROPIC_OAUTH_TOKEN', 'files-oauth')
    vi.stubEnv('ANTHROPIC_API_KEY', 'files-key')
    const { fetch, requests } = captureTransport()
    await anthropicFiles({ fetch }).get('file_1')
    expect(authOf(requests[0]!)).toMatchObject({
      authorization: 'Bearer files-oauth',
      xApiKey: null,
    })
  })

  it('anthropicFiles throws when no credential is set', () => {
    expect(() => anthropicFiles()).toThrow('are not set')
  })
})

describe('config types', () => {
  it('rejects removed fields and an apiKey on the environment factories', () => {
    // Never called: the checks are the @ts-expect-error lines (test:types).
    const typeChecks = () => {
      // @ts-expect-error anthropicText reads the credential from the environment
      anthropicText('claude-sonnet-5', { apiKey: 'key' })
      // @ts-expect-error anthropicSummarize reads the credential from the environment
      anthropicSummarize('claude-sonnet-5', { apiKey: 'key' })
      // @ts-expect-error anthropicFiles reads the credential from the environment
      anthropicFiles({ apiKey: 'key' })
      // @ts-expect-error authToken is gone: pass the token as the credential
      createAnthropicChat('claude-sonnet-5', 'token', { authToken: 'token' })
      // @ts-expect-error oauth is gone: use auth: 'oauth'
      createAnthropicChat('claude-sonnet-5', 'token', { oauth: true })
      // @ts-expect-error oauth is gone on the environment factory too
      anthropicText('claude-sonnet-5', { oauth: false })
      // @ts-expect-error auth takes only 'api-key', 'bearer', or 'oauth'
      createAnthropicChat('claude-sonnet-5', 'token', { auth: 'basic' })
    }
    expect(typeChecks).toBeTypeOf('function')
  })
})
