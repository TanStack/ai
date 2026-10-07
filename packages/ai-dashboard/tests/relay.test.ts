import { createContext, runInContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { startDashboard } from '../src'
import { connectDashboard } from '../src/connect'
import { DASHBOARD_HTML } from '../src/ui'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'

let calls = 0
function adapterSaying(answer: string): AnyTextAdapter {
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
    chatStream: () =>
      (async function* (): AsyncGenerator<StreamChunk> {
        calls += 1
        const messageId = `m-${calls}`
        const now = Date.now()
        yield {
          type: EventType.RUN_STARTED,
          runId: 'r',
          threadId: 't',
          timestamp: now,
        }
        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId,
          role: 'assistant',
          timestamp: now,
        }
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId,
          delta: answer,
          timestamp: now,
        }
        yield { type: EventType.TEXT_MESSAGE_END, messageId, timestamp: now }
        yield {
          type: EventType.RUN_FINISHED,
          runId: 'r',
          threadId: 't',
          timestamp: now,
          metadata: { tanstack: { finishReason: 'stop' } },
        }
      })(),
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
  }
}

const cleanups: Array<() => unknown> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

/** Open a session's event stream. `until` reads frames up to the first one that has `marker`. */
async function openEvents(url: string) {
  const controller = new AbortController()
  cleanups.push(() => controller.abort())
  const reader = (
    await fetch(url, { signal: controller.signal })
  ).body!.getReader()
  const decoder = new TextDecoder()
  const frames: Array<string> = []
  let buffer = ''
  return async (marker: string): Promise<Array<unknown>> => {
    while (!frames.some((frame) => frame.includes(marker))) {
      const { value, done } = await reader.read()
      if (done) throw new Error(`The stream ended before ${marker}.`)
      const blocks = (buffer + decoder.decode(value, { stream: true })).split(
        '\n\n',
      )
      buffer = blocks.pop() ?? ''
      for (const block of blocks) {
        const data = block.split('\n').find((line) => line.startsWith('data: '))
        if (data) frames.push(data.slice(6))
      }
    }
    return frames.map((frame) => JSON.parse(frame))
  }
}

/** Pair a host over the API, connect it, and wait until it is online. */
async function onlineHost(
  dashboard: { url: string; ownerToken: string },
  allowRemoteStart: boolean,
  onError?: (error: Error) => void,
) {
  const owner = {
    Authorization: `Bearer ${dashboard.ownerToken}`,
    'Content-Type': 'application/json',
  }
  const started = await (
    await fetch(`${dashboard.url}/api/pair/start`, { method: 'POST' })
  ).json()
  await fetch(`${dashboard.url}/api/pair/approve`, {
    method: 'POST',
    headers: owner,
    body: JSON.stringify({ code: started.code }),
  })
  const { hostId, token } = await (
    await fetch(
      `${dashboard.url}/api/pair/status?pairingId=${started.pairingId}`,
    )
  ).json()
  const host = createHarnessHost({ persistence: memoryPersistence() })
  cleanups.push(() => host.close())
  const connection = await connectDashboard({
    host,
    harness: defineHarness({
      name: 'acme/remote',
      adapter: adapterSaying('Hello from the host.'),
    }),
    url: dashboard.url,
    token,
    allowRemoteStart,
    onError,
  })
  cleanups.push(() => connection.close())
  // The hello tells the relay if the host allows remote start.
  await vi.waitFor(async () => {
    const hosts = await (
      await fetch(`${dashboard.url}/api/hosts`, { headers: owner })
    ).json()
    expect(hosts).toEqual([
      expect.objectContaining({ hostId, online: true, allowRemoteStart }),
    ])
  })
  return { host, hostId, owner }
}

const answered = expect.objectContaining({
  event: expect.objectContaining({ delta: 'Hello from the host.' }),
})

describe('dashboard relay', () => {
  it(
    'pairs a host, shows its session, and relays a prompt and its answer',
    { timeout: 20_000 },
    async () => {
      const dashboard = await startDashboard({ port: 0 })
      cleanups.push(() => dashboard.close())
      const owner = {
        Authorization: `Bearer ${dashboard.ownerToken}`,
        'Content-Type': 'application/json',
      }

      // The app shell loads without a token; the API does not.
      expect((await fetch(`${dashboard.url}/`)).status).toBe(200)
      expect((await fetch(`${dashboard.url}/api/hosts`)).status).toBe(401)

      const host = createHarnessHost({ persistence: memoryPersistence() })
      cleanups.push(() => host.close())
      const harness = defineHarness({
        name: 'acme/remote',
        adapter: adapterSaying('Hello from the host.'),
      })

      let savedToken = ''
      const connecting = connectDashboard({
        host,
        harness,
        url: dashboard.url,
        threads: ['main'],
        onPairingCode: (code) => {
          // The owner approves the code in the dashboard.
          void fetch(`${dashboard.url}/api/pair/approve`, {
            method: 'POST',
            headers: owner,
            body: JSON.stringify({ code }),
          })
        },
        onToken: (token) => {
          savedToken = token
        },
      })
      const connection = await connecting
      cleanups.push(() => connection.close())
      expect(savedToken).toBe(connection.token)

      await vi.waitFor(async () => {
        const hosts = await (
          await fetch(`${dashboard.url}/api/hosts`, { headers: owner })
        ).json()
        expect(hosts).toMatchObject([
          { name: 'acme/remote', online: true, harnesses: ['acme/remote'] },
        ])
      })
      const [{ hostId }] = await (
        await fetch(`${dashboard.url}/api/hosts`, { headers: owner })
      ).json()
      const receipt = await (
        await fetch(`${dashboard.url}/api/sessions/${hostId}/main/input`, {
          method: 'POST',
          headers: owner,
          body: JSON.stringify({
            input: { op: 'prompt', message: 'hi from my phone' },
          }),
        })
      ).json()
      expect(receipt.status).toBe('sent')

      // The answer comes back through the relay cache.
      await vi.waitFor(async () => {
        const sessions = await (
          await fetch(`${dashboard.url}/api/sessions`, { headers: owner })
        ).json()
        expect(sessions).toMatchObject([
          { hostId, threadId: 'main', harness: 'acme/remote', status: 'idle' },
        ])
      })
      const until = await openEvents(
        `${dashboard.url}/api/sessions/${hostId}/main/events?token=${dashboard.ownerToken}`,
      )
      expect(await until('harness.operation.finished')).toContainEqual(answered)
    },
  )

  it(
    'opens a thread on a host that allows remote start',
    { timeout: 20_000 },
    async () => {
      const dashboard = await startDashboard({ port: 0 })
      cleanups.push(() => dashboard.close())
      const { host, hostId, owner } = await onlineHost(dashboard, true)
      const session = `${dashboard.url}/api/sessions/${hostId}/fresh`
      const until = await openEvents(
        `${session}/events?token=${dashboard.ownerToken}`,
      )

      // The host opens the thread when the dashboard asks.
      const stop = new AbortController()
      cleanups.push(() => stop.abort())
      const attached = (async () => {
        for await (const event of host.events({ signal: stop.signal }))
          if (event.type === 'status' && event.threadId === 'fresh') return
      })()
      const opened = await fetch(`${session}/open`, {
        method: 'POST',
        headers: owner,
      })
      expect(opened.status).toBe(202)
      expect(await opened.json()).toEqual({ status: 'sent' })
      await attached

      const receipt = await (
        await fetch(`${session}/input`, {
          method: 'POST',
          headers: owner,
          body: JSON.stringify({ input: { op: 'prompt', message: 'hi' } }),
        })
      ).json()
      expect(receipt.status).toBe('sent')
      expect(await until('harness.operation.finished')).toContainEqual(answered)
    },
  )

  it(
    'sends an input that arrives while the thread still opens',
    { timeout: 20_000 },
    async () => {
      const dashboard = await startDashboard({ port: 0 })
      cleanups.push(() => dashboard.close())
      const { host, hostId, owner } = await onlineHost(dashboard, true)
      // Hold the open of `fresh` until the host opens `marker`. The relay
      // sends frames in order, so the host has the input for `fresh` before
      // it opens `marker`.
      let openMarker = () => {}
      const markerOpened = new Promise<void>((resolve) => {
        openMarker = resolve
      })
      const open = host.open.bind(host)
      host.open = async (harness, options) => {
        if (options.threadId === 'marker') openMarker()
        else await markerOpened
        return open(harness, options)
      }
      const session = `${dashboard.url}/api/sessions/${hostId}/fresh`
      const until = await openEvents(
        `${session}/events?token=${dashboard.ownerToken}`,
      )

      // Open the thread and send a prompt at once, with no wait between.
      await fetch(`${session}/open`, { method: 'POST', headers: owner })
      await fetch(`${session}/input`, {
        method: 'POST',
        headers: owner,
        body: JSON.stringify({ input: { op: 'prompt', message: 'hi' } }),
      })
      await fetch(`${dashboard.url}/api/sessions/${hostId}/marker/open`, {
        method: 'POST',
        headers: owner,
      })

      expect(await until('harness.receipt')).toContainEqual(
        expect.objectContaining({
          type: 'harness.receipt',
          status: 'accepted',
        }),
      )
      expect(await until('harness.operation.finished')).toContainEqual(answered)
    },
  )

  it(
    'reports a frame that the host fails to handle',
    { timeout: 20_000 },
    async () => {
      const dashboard = await startDashboard({ port: 0 })
      cleanups.push(() => dashboard.close())
      const errors: Array<Error> = []
      const { host, hostId, owner } = await onlineHost(
        dashboard,
        true,
        (error) => errors.push(error),
      )
      host.open = () => Promise.reject(new Error('The thread cannot open.'))

      await fetch(`${dashboard.url}/api/sessions/${hostId}/broken/open`, {
        method: 'POST',
        headers: owner,
      })
      await vi.waitFor(() =>
        expect(errors.map((error) => error.message)).toEqual([
          'The thread cannot open.',
        ]),
      )
    },
  )

  it(
    'refuses inputs to a thread the host does not let the dashboard start',
    { timeout: 20_000 },
    async () => {
      const dashboard = await startDashboard({ port: 0 })
      cleanups.push(() => dashboard.close())
      const { hostId, owner } = await onlineHost(dashboard, false)
      const session = `${dashboard.url}/api/sessions/${hostId}/fresh`
      const until = await openEvents(
        `${session}/events?token=${dashboard.ownerToken}`,
      )

      // The relay refuses the open at once. The host also refuses an input
      // to the thread, with the same reason.
      const opened = await fetch(`${session}/open`, {
        method: 'POST',
        headers: owner,
      })
      expect(opened.status).toBe(403)
      expect(await opened.json()).toEqual({ error: 'remote_start_disabled' })
      await fetch(`${session}/input`, {
        method: 'POST',
        headers: owner,
        body: JSON.stringify({ input: { op: 'prompt', message: 'hi' } }),
      })
      const frames = await until('remote_start_disabled')
      expect(frames).toContainEqual(
        expect.objectContaining({
          type: 'harness.receipt',
          status: 'rejected',
          reason: 'remote_start_disabled',
        }),
      )
      // The sessions list names the harness of the refused thread.
      const sessions = await (
        await fetch(`${dashboard.url}/api/sessions`, { headers: owner })
      ).json()
      expect(sessions).toMatchObject([
        { threadId: 'fresh', harness: 'acme/remote' },
      ])
    },
  )

  it(
    'shows a refusal to a view that connects after it',
    { timeout: 20_000 },
    async () => {
      const dashboard = await startDashboard({ port: 0 })
      cleanups.push(() => dashboard.close())
      const { hostId, owner } = await onlineHost(dashboard, false)
      const session = `${dashboard.url}/api/sessions/${hostId}/fresh`
      const events = `${session}/events?token=${dashboard.ownerToken}`
      const send = async (): Promise<string> => {
        const receipt = await (
          await fetch(`${session}/input`, {
            method: 'POST',
            headers: owner,
            body: JSON.stringify({ input: { op: 'prompt', message: 'hi' } }),
          })
        ).json()
        return receipt.requestId
      }

      // The first view sees the refusal live.
      const first = await openEvents(events)
      const refused = await send()
      await first('remote_start_disabled')

      // A view that connects after it gets it too. The second input only
      // makes sure that the stream has something to read.
      const late = await openEvents(events)
      await send()
      expect(await late('remote_start_disabled')).toContainEqual(
        expect.objectContaining({
          type: 'harness.receipt',
          requestId: refused,
          status: 'rejected',
          reason: 'remote_start_disabled',
        }),
      )
    },
  )

  it(
    'pairs again when the dashboard restarts on the same port',
    { timeout: 20_000 },
    async () => {
      const ownerToken = 'owner-token'
      let dashboard = await startDashboard({ port: 0, ownerToken })
      cleanups.push(() => dashboard.close())
      const owner = {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      }
      const onlineHosts = async () => {
        const hosts: unknown = await (
          await fetch(`${dashboard.url}/api/hosts`, { headers: owner })
        ).json()
        return Array.isArray(hosts)
          ? hosts.filter((host) => host.online === true)
          : []
      }

      const host = createHarnessHost({ persistence: memoryPersistence() })
      cleanups.push(() => host.close())
      const tokens: Array<string> = []
      const connection = await connectDashboard({
        host,
        harness: defineHarness({
          name: 'acme/remote',
          adapter: adapterSaying('unused'),
        }),
        url: dashboard.url,
        reconnectDelayMs: 50,
        onPairingCode: (code) => {
          void fetch(`${dashboard.url}/api/pair/approve`, {
            method: 'POST',
            headers: owner,
            body: JSON.stringify({ code }),
          })
        },
        onToken: (token) => tokens.push(token),
      })
      cleanups.push(() => connection.close())
      await vi.waitFor(async () => expect(await onlineHosts()).toHaveLength(1))

      // The restarted dashboard has no host tokens in memory.
      const port = new URL(dashboard.url).port
      await dashboard.close()
      dashboard = await startDashboard({ port: Number(port), ownerToken })

      await vi.waitFor(
        async () =>
          expect(await onlineHosts()).toMatchObject([
            { name: 'acme/remote', harnesses: ['acme/remote'] },
          ]),
        { timeout: 10_000 },
      )
      expect(tokens).toHaveLength(2)
      expect(tokens[1]).not.toBe(tokens[0])
      expect(connection.token).toBe(tokens[1])
    },
  )

  it('reports a refused token when it cannot pair again', async () => {
    const dashboard = await startDashboard({ port: 0, ownerToken: 'owner' })
    cleanups.push(() => dashboard.close())
    const host = createHarnessHost({ persistence: memoryPersistence() })
    cleanups.push(() => host.close())

    const errors: Array<Error> = []
    const connection = await connectDashboard({
      host,
      harness: defineHarness({
        name: 'acme/remote',
        adapter: adapterSaying('unused'),
      }),
      url: dashboard.url,
      token: 'a-token-from-before-the-restart',
      onError: (error) => errors.push(error),
    })
    cleanups.push(() => connection.close())

    expect(errors.map((error) => error.message)).toEqual([
      'The dashboard refused this host token.',
    ])
    const pairings = await (
      await fetch(`${dashboard.url}/api/pairings`, {
        headers: { Authorization: 'Bearer owner' },
      })
    ).json()
    expect(pairings).toEqual([])
  })

  it(
    'queues inputs for an offline host and refuses revoked hosts',
    { timeout: 20_000 },
    async () => {
      const dashboard = await startDashboard({ port: 0 })
      cleanups.push(() => dashboard.close())
      const owner = {
        Authorization: `Bearer ${dashboard.ownerToken}`,
        'Content-Type': 'application/json',
      }

      const started = await (
        await fetch(`${dashboard.url}/api/pair/start`, {
          method: 'POST',
          body: JSON.stringify({ name: 'laptop' }),
        })
      ).json()
      await fetch(`${dashboard.url}/api/pair/approve`, {
        method: 'POST',
        headers: owner,
        body: JSON.stringify({ code: started.code }),
      })
      const status = await (
        await fetch(
          `${dashboard.url}/api/pair/status?pairingId=${started.pairingId}`,
        )
      ).json()
      expect(status.status).toBe('approved')

      const queued = await (
        await fetch(`${dashboard.url}/api/sessions/${status.hostId}/t/input`, {
          method: 'POST',
          headers: owner,
          body: JSON.stringify({ input: { op: 'prompt', message: 'later' } }),
        })
      ).json()
      expect(queued.status).toBe('queued')

      const hello = (value: Record<string, unknown>) =>
        fetch(`${dashboard.url}/api/host/hello`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${status.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(value),
        })
      const openThread = () =>
        fetch(`${dashboard.url}/api/sessions/${status.hostId}/fresh/open`, {
          method: 'POST',
          headers: owner,
        })
      // An older host sends no flag. It does not allow remote start.
      await hello({ name: 'laptop' })
      const disabled = await openThread()
      expect(disabled.status).toBe(403)
      expect(await disabled.json()).toEqual({ error: 'remote_start_disabled' })
      // A host that allows it gets the open when it comes back online.
      await hello({ name: 'laptop', allowRemoteStart: true })
      const waiting = await openThread()
      expect(waiting.status).toBe(202)
      expect(await waiting.json()).toEqual({ status: 'queued' })

      await fetch(`${dashboard.url}/api/hosts/revoke`, {
        method: 'POST',
        headers: owner,
        body: JSON.stringify({ hostId: status.hostId }),
      })
      expect((await hello({})).status).toBe(401)
    },
  )
})

/** Just enough DOM for the page script. */
class FakeNode {
  children: Array<FakeNode> = []
  className = ''
  attributes: Record<string, string> = {}
  value = ''
  onsubmit?: (event: { preventDefault: () => void }) => Promise<void>
  constructor(
    readonly tag: string,
    readonly text = '',
  ) {}
  get tagName() {
    return this.tag.toUpperCase()
  }
  append(...children: Array<FakeNode>) {
    this.children.push(...children)
  }
  replaceChildren(...children: Array<FakeNode>) {
    this.children = children
  }
  setAttribute(key: string, value: string) {
    this.attributes[key] = value
  }
  contains(node: FakeNode | null): boolean {
    return node === this || this.children.some((child) => child.contains(node))
  }
  find(test: (node: FakeNode) => boolean): FakeNode | undefined {
    if (test(this)) return this
    for (const child of this.children) {
      const found = child.find(test)
      if (found) return found
    }
    return undefined
  }
  get textContent(): string {
    return this.text + this.children.map((child) => child.textContent).join('')
  }
}

/** Run the page script against a fake DOM, a fake API, and a manual timer. */
function loadPage(hosts: Array<Record<string, unknown>>) {
  const script = /<script>([\s\S]*)<\/script>/.exec(DASHBOARD_HTML)?.[1] ?? ''
  const nodes = new Map<string, FakeNode>()
  const byId = (id: string) => {
    const node = nodes.get(id) ?? new FakeNode('div')
    nodes.set(id, node)
    return node
  }
  const requests: Array<string> = []
  const sources: Array<FakeEventSource> = []
  class FakeEventSource {
    onmessage?: (message: { data: string }) => void
    constructor(readonly url: string) {
      sources.push(this)
    }
    close() {}
  }
  let tick = () => {}
  let focused: FakeNode | null = null
  runInContext(
    script,
    createContext({
      Node: FakeNode,
      document: {
        createElement: (tag: string) => new FakeNode(tag),
        createTextNode: (text: string) => new FakeNode('#text', text),
        getElementById: byId,
        get activeElement() {
          return focused
        },
      },
      location: { hash: '' },
      history: { replaceState: () => {} },
      localStorage: {
        getItem: () => 'owner',
        setItem: () => {},
        removeItem: () => {},
      },
      navigator: {},
      setInterval: (callback: () => void) => {
        tick = callback
        return 0
      },
      fetch: async (path: string, options: { method?: string } = {}) => {
        requests.push(`${options.method ?? 'GET'} ${path}`)
        const body = path === '/api/hosts' ? hosts : []
        return { status: 200, json: async () => body }
      },
      EventSource: FakeEventSource,
      URLSearchParams,
    }),
  )
  return {
    side: () => byId('side'),
    main: () => byId('main'),
    requests,
    sources,
    focus: (node: FakeNode | null) => {
      focused = node
    },
    tick: () => tick(),
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('dashboard page', () => {
  it('opens a thread from a host row, and keeps the form while it has focus', async () => {
    const page = loadPage([
      {
        hostId: 'host 1',
        name: 'laptop',
        harnesses: ['acme/remote'],
        allowRemoteStart: true,
      },
      // An older host sends no flag.
      { hostId: 'host 2', name: 'server', harnesses: ['acme/remote'] },
    ])
    await settle()
    const hostLoads = () =>
      page.requests.filter((request) => request === 'GET /api/hosts').length
    const rowOf = (name: string) =>
      page.side().find((node) => node.textContent.startsWith(name))
    const row = rowOf('laptop')
    const form = row?.find((node) => node.tag === 'form')
    const input = form?.find((node) => node.tag === 'input')
    if (!row || !form?.onsubmit || !input) throw new Error('No open form.')
    expect(row.className).toBe('row')
    expect(form.textContent).toBe('Open')
    // Only a host that allows remote start gets the form.
    expect(rowOf('server')?.textContent).toBe('server (acme/remote)')
    expect(rowOf('server')?.find((node) => node.tag === 'form')).toBeUndefined()

    // The 5 s refresh skips while the input has focus.
    input.value = 'feature/<b>'
    page.focus(input)
    page.tick()
    await settle()
    expect(hostLoads()).toBe(1)
    expect(page.side().contains(form)).toBe(true)

    await form.onsubmit({ preventDefault: () => {} })
    const path = '/api/sessions/host%201/feature%2F%3Cb%3E'
    expect(page.requests).toContain(`POST ${path}/open`)
    expect(page.sources[0]?.url).toBe(`${path}/events?token=owner`)
    expect(page.main().children[0]?.textContent).toBe('feature/<b>')

    // A refused input shows once. The relay sends the refusal again when
    // the stream reconnects.
    const refusal = JSON.stringify({
      type: 'harness.receipt',
      requestId: 'dash-1',
      status: 'rejected',
      reason: 'not_running',
    })
    page.sources[0]?.onmessage?.({ data: refusal })
    page.sources[0]?.onmessage?.({ data: refusal })
    const log = page.main().find((node) => node.className === 'log')
    expect(log?.children.map((node) => node.textContent)).toEqual([
      'Refused: not_running',
    ])

    // Without focus, the refresh runs again.
    page.focus(null)
    await settle()
    const loads = hostLoads()
    page.tick()
    await settle()
    expect(hostLoads()).toBe(loads + 1)
  })
})
