import { createFileRoute } from '@tanstack/react-router'
import type { StreamChunk } from '@tanstack/ai'

interface TriageData {
  harness: unknown
  provider: unknown
  issueUrl: unknown
  threadId: unknown
}

function json(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export async function triagePost(request: Request): Promise<Response> {
  if (request.signal.aborted) return new Response(null, { status: 499 })

  const [{ chat, toServerSentEventsStream }, { withSandbox }, triage] =
    await Promise.all([
      import('@tanstack/ai'),
      import('@tanstack/ai-sandbox'),
      import('../sandbox-triage'),
    ])
  const { HARNESSES, buildSandbox, buildTriagePrompt, fetchIssue, isHarness, isProvider, missingEnv, parseIssueUrl } = triage

  let data: TriageData
  try {
    const body = (await request.json()) as { data?: TriageData }
    if (body.data == null || typeof body.data !== 'object') {
      throw new Error('body.data is required')
    }
    data = body.data
  } catch (error) {
    return json(400, error instanceof Error ? error.message : 'invalid body')
  }

  if (!isHarness(data.harness) || !isProvider(data.provider)) {
    return json(400, 'Unknown harness or provider.')
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
    })
    const stream = chat({
      threadId,
      adapter: HARNESSES[data.harness].makeAdapter(),
      messages: [
        { role: 'user', content: buildTriagePrompt(issue, repo) },
      ],
      middleware: [withSandbox(sandbox)],
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
