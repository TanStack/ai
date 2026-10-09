import { test, expect } from './fixtures'

test.describe('harness protocol', () => {
  const headers = (testId: string, aimockPort: number) => ({
    authorization: 'Bearer e2e-token',
    'x-test-id': testId,
    'x-aimock-port': String(aimockPort),
  })

  test('refuses a request without the token', async ({ request }) => {
    const response = await request.get('/api/harness-protocol/capabilities')
    expect(response.status()).toBe(401)
  })

  test('lists exposed agents in the capabilities', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const response = await request.get('/api/harness-protocol/capabilities', {
      headers: headers(testId, aimockPort),
    })
    const body = await response.json()
    expect(body.identity.name).toBe('e2e/protocol')
    expect(body.custom.tanstack.agents[0].name).toBe('echo')
  })

  test('streams a standard AG-UI run through a session', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const response = await request.post('/api/harness-protocol/run', {
      headers: {
        ...headers(testId, aimockPort),
        'content-type': 'application/json',
      },
      data: {
        threadId: `protocol-${testId}`,
        // The run id is also the input id, so each test needs its own.
        runId: `client-run-${testId}`,
        messages: [
          { id: 'u1', role: 'user', content: '[harness-protocol] hello' },
        ],
        tools: [],
        context: [],
        state: {},
        forwardedProps: {},
      },
    })
    expect(response.headers()['content-type']).toContain('text/event-stream')
    const text = await response.text()
    const events = text
      .split('\n')
      .filter((line) => line.startsWith('data: '))
      .map((line) => JSON.parse(line.slice(6)))
    const answer = events
      .filter((event) => event.type === 'TEXT_MESSAGE_CONTENT')
      .map((event) => event.delta)
      .join('')
    expect(answer).toBe('Hello over the harness protocol.')
    // The turn runs as the run id the client sent.
    expect(events.find((event) => event.type === 'RUN_STARTED').runId).toBe(
      `client-run-${testId}`,
    )
    expect(events.at(-1).name).toBe('harness.operation.finished')
  })

  test('changes a plugin setting and runs a plugin command', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const control = async (input: unknown) =>
      (
        await request.post('/api/harness-protocol/control', {
          headers: {
            ...headers(testId, aimockPort),
            'content-type': 'application/json',
          },
          data: { threadId: `plugins-${testId}`, input },
        })
      ).json()

    expect(
      await control({ op: 'config', key: 'tone', value: 'warm' }),
    ).toMatchObject({
      status: 'accepted',
    })
    const rejected = await control({ op: 'config', key: 'tone', value: 'loud' })
    expect(rejected.status).toBe('rejected')
    expect(rejected.reason).toContain('plain, warm')
    const command = await control({ op: 'command', name: 'greet' })
    expect(command.status).toBe('accepted')
    expect(command.operationId).toMatch(/^op-command-/)
  })

  test('refuses a command and a config key that the harness does not expose', async ({
    request,
    testId,
    aimockPort,
  }) => {
    // `x-harness-permissions: 1` adds `permissions()`, so `mode` exists.
    const control = async (input: unknown) =>
      (
        await request.post('/api/harness-protocol/control', {
          headers: {
            ...headers(testId, aimockPort),
            'x-harness-permissions': '1',
            'content-type': 'application/json',
          },
          data: { threadId: `expose-${testId}`, input },
        })
      ).json()

    expect(
      await control({ op: 'command', name: 'mode', input: 'bypass' }),
    ).toMatchObject({ status: 'rejected', reason: 'not_exposed' })
    expect(
      await control({ op: 'config', key: 'mode', value: 'bypass' }),
    ).toMatchObject({ status: 'rejected', reason: 'not_exposed' })
  })

  test('lists saved permissions with the permissions command', async ({
    request,
    baseURL,
    testId,
    aimockPort,
  }) => {
    // `x-harness-permissions: 1` adds `permissions()`, with its own root.
    const auth = {
      ...headers(testId, aimockPort),
      'x-harness-permissions': '1',
    }
    const threadId = `saved-${testId}`
    const command = async (input: string) =>
      (
        await request.post('/api/harness-protocol/control', {
          headers: { ...auth, 'content-type': 'application/json' },
          data: {
            threadId,
            input: { op: 'command', name: 'permissions', input },
          },
        })
      ).json()

    expect(await command('')).toMatchObject({ status: 'accepted' })
    expect(await command('forget 1')).toMatchObject({ status: 'accepted' })

    // The session stream has the result of each command.
    const feed = await fetch(
      `${baseURL}/api/harness-protocol/events?threadId=${threadId}&from=0`,
      { headers: auth },
    )
    if (!feed.body) throw new Error('The session stream has no body.')
    const reader = feed.body.pipeThrough(new TextDecoderStream()).getReader()
    const results: Array<unknown> = []
    let buffer = ''
    while (results.length < 2) {
      const read = await reader.read()
      if (read.done) break
      buffer += read.value
      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() ?? ''
      for (const block of blocks) {
        const data = block.split('\n').find((line) => line.startsWith('data: '))
        if (!data) continue
        const frame: {
          event?: { type: string; name?: string; value?: { result?: unknown } }
        } = JSON.parse(data.slice('data: '.length))
        if (frame.event?.name === 'harness.command.result') {
          results.push(frame.event.value?.result)
        }
      }
    }
    await reader.cancel()
    expect(results).toEqual([
      'No saved rules.',
      'No saved rule 1. Run /permissions to see the list.',
    ])
  })

  test('runs a retried prompt with the same inputId once on a durable host', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const threadId = `durable-${testId}`
    const durable = { ...headers(testId, aimockPort), 'x-harness-durable': '1' }
    const control = async (input: unknown) =>
      (
        await request.post('/api/harness-protocol/control', {
          headers: { ...durable, 'content-type': 'application/json' },
          data: { threadId, input },
        })
      ).json()
    const prompt = {
      op: 'prompt',
      message: '[harness-durable] run once',
      inputId: `once-${testId}`,
    }

    const first = await control(prompt)
    const retry = await control(prompt)

    expect(first.status).toBe('accepted')
    expect(retry).toEqual(first)
    const answers = async () => {
      const response = await request.get(
        `/api/harness-protocol/transcript?threadId=${threadId}`,
        { headers: durable },
      )
      const transcript: Array<{ role: string; content: unknown }> =
        await response.json()
      return transcript
        .filter((message) => message.role === 'assistant')
        .map((message) => message.content)
    }
    await expect.poll(answers).toEqual(['Stored once.'])
    expect(
      await control({ ...prompt, message: '[harness-durable] other text' }),
    ).toMatchObject({ status: 'rejected', reason: 'conflict' })
  })

  test('retries a 503 from the model in the same turn', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const threadId = `retry-${testId}`
    const turnHeaders = {
      ...headers(testId, aimockPort),
      'x-harness-turn': 'retry',
    }
    const receipt = await (
      await request.post('/api/harness-protocol/control', {
        headers: { ...turnHeaders, 'content-type': 'application/json' },
        data: {
          threadId,
          input: { op: 'prompt', message: '[harness-retry] try twice' },
        },
      })
    ).json()
    expect(receipt.status).toBe('accepted')

    const answers = async () => {
      const response = await request.get(
        `/api/harness-protocol/transcript?threadId=${threadId}`,
        { headers: turnHeaders },
      )
      const transcript: Array<{ role: string; content: unknown }> =
        await response.json()
      return transcript
        .filter((message) => message.role === 'assistant')
        .map((message) => message.content)
    }
    await expect.poll(answers).toEqual(['Back after a retry.'])
  })

  test('sends the model back to work with beforeFinish', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const threadId = `finish-${testId}`
    const turnHeaders = {
      ...headers(testId, aimockPort),
      'x-harness-turn': 'finish',
    }
    await request.post('/api/harness-protocol/control', {
      headers: { ...turnHeaders, 'content-type': 'application/json' },
      data: {
        threadId,
        input: { op: 'prompt', message: '[harness-finish] post it' },
      },
    })

    const transcript = async () => {
      const response = await request.get(
        `/api/harness-protocol/transcript?threadId=${threadId}`,
        { headers: turnHeaders },
      )
      const messages: Array<{ role: string; content: unknown }> =
        await response.json()
      return messages.map(
        (message) => `${message.role}: ${String(message.content)}`,
      )
    }
    await expect
      .poll(transcript)
      .toEqual([
        'user: [harness-finish] post it',
        'assistant: Draft answer.',
        'user: [harness-finish] reminder: post the answer',
        'assistant: Posted answer.',
      ])
  })

  test('reverts to an earlier message, then unreverts', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const threadId = `revert-${testId}`
    const json = {
      ...headers(testId, aimockPort),
      'content-type': 'application/json',
    }
    const control = async (input: unknown) =>
      (
        await request.post('/api/harness-protocol/control', {
          headers: json,
          data: { threadId, input },
        })
      ).json()
    const transcript = async () => {
      const response = await request.get(
        `/api/harness-protocol/transcript?threadId=${threadId}`,
        { headers: json },
      )
      const messages: Array<{ id: string; role: string; content: unknown }> =
        await response.json()
      return messages
    }
    const lines = async () =>
      (await transcript()).map(
        (message) => `${message.role}: ${String(message.content)}`,
      )
    await control({ op: 'prompt', message: '[harness-revert] first' })
    await expect.poll(lines).toHaveLength(2)
    await control({ op: 'prompt', message: '[harness-revert] second' })
    const all = [
      'user: [harness-revert] first',
      'assistant: First answer.',
      'user: [harness-revert] second',
      'assistant: Second answer.',
    ]
    await expect.poll(lines).toEqual(all)
    const [, firstAnswer] = await transcript()

    // A refused revert changes nothing, so the test can ask again until the
    // last turn has ended.
    await expect
      .poll(
        async () =>
          (await control({ op: 'revert', messageId: firstAnswer?.id })).status,
      )
      .toBe('accepted')
    expect(await lines()).toEqual(all.slice(0, 2))

    expect(await control({ op: 'unrevert' })).toMatchObject({
      status: 'accepted',
    })
    expect(await lines()).toEqual(all)
  })

  test('gives an ephemeral reminder from beforeFinish to the next model call only', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const threadId = `ephemeral-${testId}`
    const turnHeaders = {
      ...headers(testId, aimockPort),
      'x-harness-turn': 'ephemeral',
    }
    await request.post('/api/harness-protocol/control', {
      headers: { ...turnHeaders, 'content-type': 'application/json' },
      data: {
        threadId,
        input: { op: 'prompt', message: '[harness-finish] post it' },
      },
    })

    const transcript = async () => {
      const response = await request.get(
        `/api/harness-protocol/transcript?threadId=${threadId}`,
        { headers: turnHeaders },
      )
      const messages: Array<{ role: string; content: unknown }> =
        await response.json()
      return messages.map(
        (message) => `${message.role}: ${String(message.content)}`,
      )
    }
    // The transcript does not keep the reminder.
    await expect
      .poll(transcript)
      .toEqual([
        'user: [harness-finish] post it',
        'assistant: Draft answer.',
        'assistant: Posted answer.',
      ])

    // The second model call got the reminder as its last message.
    const journal = await request.get(
      `http://127.0.0.1:${aimockPort}/v1/_requests`,
    )
    const entries: Array<{
      headers?: Record<string, string>
      body: { messages?: Array<{ role: string; content: unknown }> } | null
    }> = await journal.json()
    const lastSent = entries
      .filter((entry) => entry.headers?.['x-test-id'] === testId)
      .map((entry) => entry.body?.messages?.at(-1)?.content)
    expect(lastSent).toEqual([
      '[harness-finish] post it',
      '[harness-finish] reminder: post the answer',
    ])
  })

  test('takes a control input and returns a receipt', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const response = await request.post('/api/harness-protocol/control', {
      headers: {
        ...headers(testId, aimockPort),
        'content-type': 'application/json',
      },
      data: {
        threadId: `control-${testId}`,
        input: { op: 'agent', agent: 'echo', input: { text: 'hi' } },
      },
    })
    const receipt = await response.json()
    expect(receipt.status).toBe('accepted')
    expect(receipt.operationId).toMatch(/^op-agent-/)
  })

  test('lists, renames, and forks sessions with their settings', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const auth = headers(testId, aimockPort)
    const json = { ...auth, 'content-type': 'application/json' }
    const first = `sessions-a-${testId}`
    const second = `sessions-b-${testId}`
    const settings = { model: 'strong', instructions: 'Answer in one word.' }
    const configured = await request.post('/api/harness-protocol/control', {
      headers: json,
      data: { threadId: first, input: { op: 'configure', settings } },
    })
    expect(await configured.json()).toMatchObject({ status: 'accepted' })
    const run = await request.post('/api/harness-protocol/run', {
      headers: json,
      data: {
        threadId: first,
        runId: `sessions-run-${testId}`,
        messages: [
          { id: 'u1', role: 'user', content: '[harness-protocol] hello' },
        ],
        tools: [],
        context: [],
        state: {},
        forwardedProps: {},
      },
    })
    // The stream ends with the turn.
    await run.text()
    // The second thread only opens.
    const opened = await request.get(
      `/api/harness-protocol/snapshot?threadId=${second}`,
      { headers: auth },
    )
    expect(opened.status()).toBe(200)

    const sessions = (body: object) =>
      request.post('/api/harness-protocol/sessions', {
        headers: json,
        data: body,
      })
    const title = 'Trip plan'
    const renamed = await sessions({ op: 'rename', threadId: first, title })
    expect(await renamed.json()).toMatchObject({ threadId: first, title })

    const transcript = async (threadId: string) => {
      const response = await request.get(
        `/api/harness-protocol/transcript?threadId=${threadId}`,
        { headers: auth },
      )
      const messages: Array<{ id?: string; role: string; content: unknown }> =
        await response.json()
      return messages
    }
    const source = await transcript(first)
    expect(source.map((message) => message.role)).toEqual(['user', 'assistant'])
    const at = source[0]?.id
    if (!at) throw new Error('The prompt has no message id.')
    const forked = await sessions({ op: 'fork', threadId: first, through: at })
    expect(forked.status()).toBe(200)
    const fork: { threadId: string; title?: string } = await forked.json()
    expect(fork.title).toBe(`${title} (fork)`)
    // The fork has the messages through the prompt, and the stored settings.
    const copied = await transcript(fork.threadId)
    expect(copied.map((message) => message.content)).toEqual([
      '[harness-protocol] hello',
    ])
    const described = await request.get(
      `/api/harness-protocol/describe?threadId=${fork.threadId}`,
      { headers: auth },
    )
    expect((await described.json()).settings).toMatchObject(settings)

    // The host is shared, so the list has the threads of other tests too.
    const response = await request.get('/api/harness-protocol/sessions', {
      headers: auth,
    })
    const listed: { entries: Array<{ threadId: string; title?: string }> } =
      await response.json()
    const titles = Object.fromEntries(
      listed.entries.map((entry) => [entry.threadId, entry.title ?? null]),
    )
    expect(titles).toMatchObject({
      [first]: title,
      [second]: null,
      [fork.threadId]: `${title} (fork)`,
    })
  })

  test('lists the child of a thread with parentThreadId', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const auth = headers(testId, aimockPort)
    const threadId = `children-${testId}`
    const response = await request.post('/api/harness-protocol/control', {
      headers: { ...auth, 'content-type': 'application/json' },
      data: {
        threadId,
        input: { op: 'agent', agent: 'echo', input: { text: 'hi' } },
      },
    })
    expect(await response.json()).toMatchObject({ status: 'accepted' })

    // The agent run is a child session `subagent:<id>` of the thread.
    const query = new URLSearchParams({ parentThreadId: threadId })
    await expect
      .poll(async () => {
        const listed = await request.get(
          `/api/harness-protocol/sessions?${query}`,
          { headers: auth },
        )
        const body: {
          entries: Array<{ threadId: string; parentThreadId?: string }>
        } = await listed.json()
        return body.entries
      })
      .toEqual([
        expect.objectContaining({
          threadId: expect.stringMatching(/^subagent:/),
          parentThreadId: threadId,
        }),
      ])
  })

  test('searches the session list by title, without case', async ({
    request,
    testId,
    aimockPort,
  }) => {
    const auth = headers(testId, aimockPort)
    const json = { ...auth, 'content-type': 'application/json' }
    const titles = {
      [`search-a-${testId}`]: `Plan the trip ${testId}`,
      [`search-b-${testId}`]: `Write the docs ${testId}`,
      [`search-c-${testId}`]: `Trip budget ${testId}`,
    }
    for (const [threadId, title] of Object.entries(titles)) {
      const opened = await request.get(
        `/api/harness-protocol/snapshot?threadId=${threadId}`,
        { headers: auth },
      )
      expect(opened.status()).toBe(200)
      const renamed = await request.post('/api/harness-protocol/sessions', {
        headers: json,
        data: { op: 'rename', threadId, title },
      })
      expect(renamed.status()).toBe(200)
    }

    // The test id keeps out the threads of other tests on the shared host.
    const query = new URLSearchParams({ search: `TRIP ${testId}` })
    const response = await request.get(
      `/api/harness-protocol/sessions?${query}`,
      { headers: auth },
    )
    const listed: { entries: Array<{ threadId: string }> } =
      await response.json()
    expect(listed.entries.map((entry) => entry.threadId)).toEqual([
      `search-a-${testId}`,
    ])
    const budget = await request.get(
      `/api/harness-protocol/sessions?${new URLSearchParams({ search: 'trip' })}`,
      { headers: auth },
    )
    const found: { entries: Array<{ threadId: string }> } = await budget.json()
    expect(found.entries.map((entry) => entry.threadId)).toEqual(
      expect.arrayContaining([`search-a-${testId}`, `search-c-${testId}`]),
    )
    expect(found.entries.map((entry) => entry.threadId)).not.toContain(
      `search-b-${testId}`,
    )
  })

  test('shows running, then idle, on the host status feed', async ({
    request,
    baseURL,
    testId,
    aimockPort,
  }) => {
    const auth = headers(testId, aimockPort)
    const threadId = `status-${testId}`
    // Open the session first, so the feed starts with its status.
    await request.get(`/api/harness-protocol/snapshot?threadId=${threadId}`, {
      headers: auth,
    })
    const feed = await fetch(`${baseURL}/api/harness-protocol/host-events`, {
      headers: auth,
    })
    if (!feed.body) throw new Error('The status feed has no stream.')
    const reader = feed.body.pipeThrough(new TextDecoderStream()).getReader()
    // The feed has every session of this user. This test reads its own.
    const statuses: Array<string> = []
    let buffer = ''
    while (statuses.length < 3) {
      const read = await reader.read()
      if (read.done) break
      buffer += read.value
      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() ?? ''
      for (const block of blocks) {
        if (!block.startsWith('data: ')) continue
        const event: { type: string; threadId?: string; status?: string } =
          JSON.parse(block.slice('data: '.length))
        const isOurs = event.type === 'status' && event.threadId === threadId
        if (!isOurs || !event.status) continue
        statuses.push(event.status)
        if (statuses.length > 1) continue
        // The first status shows that the feed reads, so start a turn now.
        const receipt = await request.post('/api/harness-protocol/control', {
          headers: { ...auth, 'content-type': 'application/json' },
          data: {
            threadId,
            input: { op: 'prompt', message: '[harness-protocol] hello' },
          },
        })
        expect(await receipt.json()).toMatchObject({ status: 'accepted' })
      }
    }
    await reader.cancel()
    expect(statuses).toEqual(['idle', 'running', 'idle'])
  })
})
