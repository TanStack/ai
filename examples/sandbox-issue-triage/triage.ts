/**
 * Shared logic for the issue-triage demo (used by process.ts and docker.ts).
 *
 * Flow:
 *   1. Fetch the first OPEN issue on TanStack/ai from the GitHub API.
 *   2. Spin up a sandbox with the repo cloned in.
 *   3. Attach a file-event watcher (sandbox hooks) so we see the agent's edits live.
 *   4. Run Claude Code INSIDE the sandbox to investigate the issue and write
 *      `ISSUE-REPORT.md` at the repo root.
 *   5. Read that report back out of the sandbox and persist it to ./reports/
 *      on the HOST, with a header + the observed file events appended.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chat } from '@tanstack/ai'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import {
  defineSandbox,
  defineWorkspace,
  githubRepo,
  watchWorkspace,
  withSandbox,
  withSandboxFileEvents,
} from '@tanstack/ai-sandbox'
import type { FileEvent, SandboxProvider } from '@tanstack/ai-sandbox'
import type { StreamChunk } from '@tanstack/ai'

const REPO = 'TanStack/ai'

export interface GitHubIssue {
  number: number
  title: string
  body: string
  url: string
}

/** Fetch the oldest open issue (filtering out pull requests). */
export async function fetchFirstOpenIssue(): Promise<GitHubIssue> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'tanstack-ai-sandbox-issue-triage',
  }
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/issues?state=open&sort=created&direction=asc&per_page=20`,
    { headers },
  )
  if (!res.ok) {
    throw new Error(
      `GitHub API ${res.status} ${res.statusText}: ${await res.text()}`,
    )
  }
  const items = (await res.json()) as Array<{
    number: number
    title: string
    body: string | null
    html_url: string
    pull_request?: unknown
  }>
  const issue = items.find((item) => item.pull_request === undefined)
  if (!issue) throw new Error(`No open issues found on ${REPO}.`)
  return {
    number: issue.number,
    title: issue.title,
    body: issue.body ?? '',
    url: issue.html_url,
  }
}

export interface RunTriageOptions {
  provider: SandboxProvider
  /** Short label used in logs + the report filename (e.g. 'process', 'docker'). */
  providerLabel: string
  /** Bootstrap commands run once after the repo is cloned. */
  setup: Array<string>
  /** Secrets injected into the sandbox env (never persisted). */
  secrets: Record<string, string>
}

const REPORT_FILE = 'ISSUE-REPORT.md'

function buildPrompt(issue: GitHubIssue): string {
  return [
    `You are triaging a GitHub issue in the ${REPO} repository, which is checked`,
    `out in your current working directory.`,
    '',
    `Issue #${issue.number}: ${issue.title}`,
    `URL: ${issue.url}`,
    '',
    'Issue body:',
    issue.body || '(no description provided)',
    '',
    'Investigate the repository to understand and triage this issue. Do NOT',
    'change any source code — this is analysis only. When done, WRITE your',
    `findings to a file named ${REPORT_FILE} in the current working directory`,
    '(the repository root), as Markdown with these sections:',
    '',
    '## Summary',
    '## Root cause / analysis',
    '## Affected files (with paths)',
    '## Proposed fix',
    '## Confidence',
  ].join('\n')
}

/** Run one triage end-to-end against the given provider; returns the report path. */
export async function runTriage(options: RunTriageOptions): Promise<string> {
  const issue = await fetchFirstOpenIssue()
  console.log(
    `\n▶ [${options.providerLabel}] Triaging issue #${issue.number}: ${issue.title}\n  ${issue.url}\n`,
  )

  const sandbox = defineSandbox({
    id: `issue-triage-${options.providerLabel}`,
    provider: options.provider,
    workspace: defineWorkspace({
      source: githubRepo({ repo: REPO }),
      setup: options.setup,
      secrets: options.secrets,
    }),
    lifecycle: { reuse: 'thread' },
  })

  const threadId = `triage-${options.providerLabel}-${issue.number}`
  const ensureCtx = { threadId, runId: 'triage-setup' }

  console.log('  ⧗ Bootstrapping sandbox (clone + setup)…')
  const handle = await sandbox.ensure(ensureCtx)

  // Sandbox hooks: log + collect the agent's file changes live.
  const fileEvents: Array<FileEvent> = []
  const watcher = await watchWorkspace(handle, {
    onEvent: (event) => {
      fileEvents.push(event)
      const mark =
        event.type === 'create' ? '+' : event.type === 'delete' ? '-' : '~'
      console.log(`    [${mark}] ${event.type} ${event.path}`)
    },
  })

  let assistantText = ''
  try {
    const stream = chat({
      threadId,
      adapter: claudeCodeText('sonnet'),
      messages: [{ role: 'user', content: buildPrompt(issue) }],
      // withSandbox provides the handle; withSandboxFileEvents surfaces file
      // events into the stream as CUSTOM `sandbox.file` events too.
      middleware: [withSandbox(sandbox), withSandboxFileEvents()],
    }) as AsyncIterable<StreamChunk>

    for await (const chunk of stream) {
      const c = chunk as Record<string, unknown> & { type: string }
      switch (c.type) {
        case 'TEXT_MESSAGE_CONTENT': {
          const delta = (c.delta as string) ?? ''
          assistantText += delta
          process.stdout.write(delta)
          break
        }
        case 'TOOL_CALL_START':
          console.log(`\n  ↳ [tool] ${(c.toolCallName as string) ?? ''}`)
          break
        case 'CUSTOM':
          if (c.name === 'sandbox.file') {
            const value = c.value as FileEvent
            console.log(`  ⟳ [stream] ${value.type} ${value.path}`)
          }
          break
        case 'RUN_FINISHED':
          console.log('\n\n✅ agent finished')
          break
        case 'RUN_ERROR':
          console.error('\n\n❌ error:', c.message)
          break
        default:
          break
      }
    }
  } finally {
    await watcher.stop()
  }

  // Read the report back out of the sandbox; fall back to the streamed text.
  let report: string
  try {
    report = await handle.fs.read(REPORT_FILE)
  } catch {
    report = ''
  }
  if (report.trim() === '') {
    report = assistantText.trim() || '_(the agent produced no report)_'
  }

  const observed =
    fileEvents.length === 0
      ? '_(none observed)_'
      : fileEvents.map((e) => `- \`${e.type}\` ${e.path}`).join('\n')

  const stamp = new Date().toISOString()
  const out = [
    `# Issue triage — ${REPO}#${issue.number}`,
    '',
    `- **Issue:** [${issue.title}](${issue.url})`,
    `- **Sandbox provider:** ${options.providerLabel} (${handle.provider})`,
    `- **Generated:** ${stamp}`,
    '',
    '---',
    '',
    report.trim(),
    '',
    '---',
    '',
    '## Observed file events (sandbox hooks)',
    '',
    observed,
    '',
  ].join('\n')

  const here = dirname(fileURLToPath(import.meta.url))
  const reportPath = join(
    here,
    'reports',
    `issue-${issue.number}-${options.providerLabel}.md`,
  )
  await mkdir(dirname(reportPath), { recursive: true })
  await writeFile(reportPath, out, 'utf8')

  await sandbox.destroy(ensureCtx)

  console.log(`\n📝 Report written to ${reportPath}\n`)
  return reportPath
}
