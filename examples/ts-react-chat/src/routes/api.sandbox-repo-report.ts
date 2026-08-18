import { createFileRoute } from '@tanstack/react-router'
import {
  isReportAgent,
  isReportAuthMode,
  isReportHarness,
  isReportProvider,
  REPORT_AGENTS,
  REPORT_REPO,
} from '../repo-report-options'
import { RepoReportSchema } from '../repo-report-schema'
import type { ReportAgent } from '../repo-report-options'

interface ReportBody {
  harness: unknown
  provider: unknown
  authMode: unknown
  agent: unknown
  threadId: unknown
}

function json(status: number, error: string): Response {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export function buildRepoReportPrompt(agent: ReportAgent): string {
  const focus = REPORT_AGENTS[agent].hint
  return [
    `The ${REPORT_REPO} repository is checked out in the working directory.`,
    'Read README, package.json, and packages/* enough to answer.',
    'Do not change files.',
    `Focus: ${focus}.`,
    'Return only the structured report.',
  ].join('\n')
}

export async function repoReportPost(request: Request): Promise<Response> {
  if (request.signal.aborted) return new Response(null, { status: 499 })

  const [{ chat, toServerSentEventsStream }, { withSandbox }, triage] =
    await Promise.all([
      import('@tanstack/ai'),
      import('@tanstack/ai-sandbox'),
      import('../sandbox-triage'),
    ])
  const { buildHarnessAdapter, buildSandbox, isProvider, missingEnv } = triage

  let data: ReportBody
  try {
    const body = (await request.json()) as {
      data?: ReportBody
      forwardedProps?: ReportBody
    }
    const layer = body.data ?? body.forwardedProps
    if (layer == null || typeof layer !== 'object') {
      throw new Error('body.data (or forwardedProps) is required')
    }
    data = layer
  } catch (error) {
    return json(400, error instanceof Error ? error.message : 'invalid body')
  }

  if (!isReportHarness(data.harness) || !isProvider(data.provider)) {
    return json(400, 'Unknown harness or provider.')
  }
  if (!isReportProvider(data.provider)) {
    return json(400, 'This page only supports docker or local.')
  }
  if (!isReportAgent(data.agent)) {
    return json(400, 'Unknown agent.')
  }
  const authMode = isReportAuthMode(data.authMode) ? data.authMode : 'api-key'

  const threadId =
    typeof data.threadId === 'string' && data.threadId !== ''
      ? data.threadId
      : crypto.randomUUID()
  const missing = missingEnv(data.harness, data.provider, authMode)
  if (missing.length > 0) {
    return json(
      500,
      `Missing required env: ${missing.join(', ')}. Set it and restart the dev server.`,
    )
  }

  const abortController = new AbortController()
  request.signal.addEventListener('abort', () => abortController.abort())

  try {
    const sandbox = buildSandbox({
      harness: data.harness,
      provider: data.provider,
      repo: REPORT_REPO,
      threadId,
      authMode,
    })
    const stream = chat({
      threadId,
      adapter: buildHarnessAdapter(data.harness, data.provider, { authMode }),
      messages: [{ role: 'user', content: buildRepoReportPrompt(data.agent) }],
      outputSchema: RepoReportSchema,
      stream: true,
      middleware: [withSandbox(sandbox)],
      abortController,
    })
    return new Response(toServerSentEventsStream(stream, abortController), {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    return json(500, error instanceof Error ? error.message : 'report failed')
  }
}

export const Route = createFileRoute('/api/sandbox-repo-report')({
  server: {
    handlers: {
      POST: ({ request }) => repoReportPost(request),
    },
  },
})
