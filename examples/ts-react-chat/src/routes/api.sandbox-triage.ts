import { createFileRoute } from '@tanstack/react-router'
import type { StreamChunk } from '@tanstack/ai'

interface TriageData {
  harness: unknown
  provider: unknown
  issueUrl: unknown
  threadId: unknown
  keepAlive: unknown
  useSubscription: unknown
  grokProtocol: unknown
  grokTransport: unknown
}

function json(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export async function triagePost(request: Request): Promise<Response> {
  if (request.signal.aborted) return new Response(null, { status: 499 })

  const [
    { chat, toServerSentEventsStream },
    { withSandbox },
    triage,
    { createTriageTools },
    { withNgrokBridge, ngrokConfigured },
  ] = await Promise.all([
    import('@tanstack/ai'),
    import('@tanstack/ai-sandbox'),
    import('../sandbox-triage'),
    import('../triage-tools'),
    import('@tanstack/ai-sandbox/ngrok'),
  ])
  const {
    PROVIDERS,
    buildHarnessAdapter,
    buildSandbox,
    buildTriagePrompt,
    fetchIssue,
    isHarness,
    isProvider,
    missingEnv,
    parseIssueUrl,
  } = triage

  let data: TriageData
  try {
    const body = (await request.json()) as {
      data?: TriageData
      forwardedProps?: TriageData
    }
    const layer = body.data ?? body.forwardedProps
    if (layer == null || typeof layer !== 'object') {
      throw new Error('body.data (or forwardedProps) is required')
    }
    data = layer
  } catch (error) {
    return json(400, error instanceof Error ? error.message : 'invalid body')
  }

  if (!isHarness(data.harness) || !isProvider(data.provider)) {
    return json(400, 'Unknown harness or provider.')
  }
  const { isGrokProtocol, isGrokTransport } = await import(
    '../sandbox-triage-options'
  )
  if (
    data.harness === 'grok' &&
    data.grokProtocol !== undefined &&
    !isGrokProtocol(data.grokProtocol)
  ) {
    return json(400, 'Unknown grokProtocol.')
  }
  if (
    data.harness === 'grok' &&
    data.grokTransport !== undefined &&
    !isGrokTransport(data.grokTransport)
  ) {
    return json(400, 'Unknown grokTransport.')
  }
  if (typeof data.issueUrl !== 'string') {
    return json(400, 'issueUrl is required.')
  }
  const threadId =
    typeof data.threadId === 'string' && data.threadId !== ''
      ? data.threadId
      : crypto.randomUUID()
  const missing = missingEnv(data.harness, data.provider)
  if (missing.length > 0) {
    return json(
      500,
      `Missing required env: ${missing.join(', ')}. Set it and restart the dev server.`,
    )
  }

  let repo: string
  let issueNumber: number
  try {
    ;({ repo, issueNumber } = parseIssueUrl(data.issueUrl))
  } catch (error) {
    return json(400, error instanceof Error ? error.message : 'bad issue url')
  }

  const abortController = new AbortController()
  request.signal.addEventListener('abort', () => abortController.abort())

  try {
    const issue = await fetchIssue(repo, issueNumber)
    const sandbox = buildSandbox({
      harness: data.harness,
      provider: data.provider,
      repo,
      threadId,
      keepAlive: data.keepAlive === true,
      useSubscription: data.useSubscription === true,
    })
    // The host tool bridge is a localhost server: same-machine providers
    // (local, docker) reach it directly. Remote cloud sandboxes (daytona,
    // vercel) can't — UNLESS we tunnel the bridge out with ngrok (set
    // NGROK_AUTHTOKEN). When neither applies, skip the tools so the agent
    // doesn't flail on tools it can never call, and run a plain triage.
    const useNgrok = !PROVIDERS[data.provider].toolBridge && ngrokConfigured()
    const bridgeReachable = PROVIDERS[data.provider].toolBridge || useNgrok
    const triageTools = bridgeReachable
      ? createTriageTools(repo, issueNumber)
      : null
    const stream = chat({
      threadId,
      adapter: buildHarnessAdapter(
        data.harness,
        data.provider,
        data.harness === 'grok'
          ? {
              protocol: isGrokProtocol(data.grokProtocol)
                ? data.grokProtocol
                : 'acp',
              transport: isGrokTransport(data.grokTransport)
                ? data.grokTransport
                : 'auto',
            }
          : undefined,
      ),
      messages: [{ role: 'user', content: buildTriagePrompt(issue, repo) }],
      // For cloud providers, route the bridge through ngrok so the in-sandbox
      // harness can reach the host tools. Local/Docker use the default bridge.
      middleware: useNgrok
        ? [withSandbox(sandbox), withNgrokBridge]
        : [withSandbox(sandbox)],
      // Bridged tools + the mandate forcing both to run before any repo work.
      ...(triageTools
        ? {
            tools: triageTools.tools,
            systemPrompts: [
              triageTools.mandate,
              triageTools.codeModeSystemPrompt,
            ],
          }
        : {}),
      abortController,
    }) as AsyncIterable<StreamChunk>
    return new Response(toServerSentEventsStream(stream, abortController), {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    if (abortController.signal.aborted) {
      return new Response(null, { status: 499 })
    }
    console.error('[api/sandbox-triage] error:', error)
    return json(502, error instanceof Error ? error.message : 'run error')
  }
}

export const Route = createFileRoute('/api/sandbox-triage')({
  server: {
    handlers: {
      POST: ({ request }) => triagePost(request),
    },
  },
})
