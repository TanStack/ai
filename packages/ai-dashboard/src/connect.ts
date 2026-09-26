import { applyInput, parseHarnessInput } from '@tanstack/ai-harness'
import type {
  AnyHarness,
  HarnessHost,
  HarnessSession,
} from '@tanstack/ai-harness'

export interface ConnectDashboardOptions {
  host: HarnessHost
  harness: AnyHarness
  /** The dashboard URL, for example `https://dash.example.com`. */
  url: string
  /** The host token. Without one, the host pairs first (see `onPairingCode`). */
  token?: string
  /** How this host shows up in the dashboard. */
  name?: string
  /** Threads to show in the dashboard at once. */
  threads?: ReadonlyArray<string>
  /** Let the dashboard open new sessions on this host. Default false. */
  allowRemoteStart?: boolean
  /** Called with the code to approve in the dashboard. */
  onPairingCode?: (code: string) => void
  /** Called with the new host token after pairing. Save it to skip pairing next time. */
  onToken?: (token: string) => void
  fetch?: typeof fetch
  /** Wait between reconnects, doubled up to 30 s. Default 1000 ms. */
  reconnectDelayMs?: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

async function* sseData(response: Response): AsyncGenerator<unknown> {
  if (!response.body) return
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split('\n\n')
    buffer = blocks.pop() ?? ''
    for (const block of blocks) {
      const data = block
        .split('\n')
        .find((line) => line.startsWith('data: '))
        ?.slice(6)
      if (data) yield JSON.parse(data)
    }
  }
}

/**
 * Connect a harness host to a dashboard. The host dials out, so it needs no
 * open port. The dashboard shows its sessions and sends inputs back. Every
 * input goes through the same session API as a local client.
 */
export async function connectDashboard(options: ConnectDashboardOptions) {
  const base = options.url.replace(/\/$/, '')
  const doFetch = options.fetch ?? fetch
  const stopped = new AbortController()
  let token = options.token

  if (!token) {
    const started = await (
      await doFetch(`${base}/api/pair/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: options.name ?? options.harness.name }),
      })
    ).json()
    if (
      !isRecord(started) ||
      typeof started.pairingId !== 'string' ||
      typeof started.code !== 'string'
    ) {
      throw new Error('The dashboard did not start a pairing.')
    }
    options.onPairingCode?.(started.code)
    while (!token) {
      if (stopped.signal.aborted)
        throw new Error('Stopped before pairing finished.')
      await new Promise((resolve) => setTimeout(resolve, 1000))
      const status: unknown = await (
        await doFetch(
          `${base}/api/pair/status?pairingId=${encodeURIComponent(started.pairingId)}`,
        )
      ).json()
      if (
        isRecord(status) &&
        status.status === 'approved' &&
        typeof status.token === 'string'
      ) {
        token = status.token
      } else if (!isRecord(status) || status.status !== 'pending') {
        throw new Error('The pairing expired. Start again.')
      }
    }
    options.onToken?.(token)
  }
  const hostToken = token
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${hostToken}`,
  }

  const post = (path: string, value: unknown) =>
    doFetch(`${base}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(value),
    })

  await post('/api/host/hello', {
    name: options.name ?? options.harness.name,
    harnesses: [options.harness.name],
  })

  const attached = new Map<string, HarnessSession>()
  const attach = async (threadId: string): Promise<HarnessSession> => {
    const existing = attached.get(threadId)
    if (existing) return existing
    const session = await options.host.open(options.harness, { threadId })
    attached.set(threadId, session)
    // Batch events so a streaming answer is a few requests, not one per token.
    let pending: Array<unknown> = []
    let timer: ReturnType<typeof setTimeout> | undefined
    const flush = () => {
      timer = undefined
      const frames = pending
      pending = []
      if (frames.length > 0) {
        void post('/api/host/frames', {
          threadId,
          harness: options.harness.name,
          frames,
        }).catch(() => {})
      }
    }
    void (async () => {
      for await (const entry of session.events({
        from: '0',
        signal: stopped.signal,
      })) {
        pending.push({ type: 'harness.event', ...entry })
        timer ??= setTimeout(flush, 50)
      }
    })()
    return session
  }
  for (const threadId of options.threads ?? []) await attach(threadId)

  const handle = async (envelope: unknown) => {
    if (
      !isRecord(envelope) ||
      typeof envelope.threadId !== 'string' ||
      !isRecord(envelope.frame)
    )
      return
    const { threadId, frame } = envelope
    if (frame.type === 'harness.subscribe') {
      if (attached.has(threadId) || options.allowRemoteStart)
        await attach(threadId)
      return
    }
    const session = attached.get(threadId)
    if (!session) {
      if (
        frame.type === 'harness.input' &&
        typeof frame.requestId === 'string'
      ) {
        await post('/api/host/frames', {
          threadId,
          frames: [
            {
              type: 'harness.receipt',
              requestId: frame.requestId,
              status: 'rejected',
              reason: 'remote_start_disabled',
            },
          ],
        })
      }
      return
    }
    if (frame.type === 'harness.input' && typeof frame.requestId === 'string') {
      try {
        const receipt = await applyInput(
          options.harness,
          session,
          parseHarnessInput(frame.input),
        )
        await post('/api/host/frames', {
          threadId,
          frames: [
            { type: 'harness.receipt', requestId: frame.requestId, ...receipt },
          ],
        })
      } catch (error) {
        await post('/api/host/frames', {
          threadId,
          frames: [
            {
              type: 'harness.error',
              message: error instanceof Error ? error.message : String(error),
            },
          ],
        })
      }
    }
  }

  // The control stream, with reconnects.
  void (async () => {
    let delay = options.reconnectDelayMs ?? 1000
    while (!stopped.signal.aborted) {
      try {
        const response = await doFetch(`${base}/api/host/stream`, {
          headers,
          signal: stopped.signal,
        })
        if (response.status === 401)
          throw new Error('The dashboard refused this host token.')
        delay = options.reconnectDelayMs ?? 1000
        for await (const envelope of sseData(response)) void handle(envelope)
      } catch (error) {
        if (stopped.signal.aborted) return
        if (error instanceof Error && error.message.includes('refused')) return
      }
      await new Promise((resolve) => setTimeout(resolve, delay))
      delay = Math.min(delay * 2, 30_000)
    }
  })()

  return {
    token: hostToken,
    /** Show another thread in the dashboard. */
    attach: (threadId: string) => attach(threadId).then(() => undefined),
    close: () => stopped.abort(),
  }
}
