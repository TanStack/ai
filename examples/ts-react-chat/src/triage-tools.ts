/**
 * Tools bridged into the sandbox harness for the triage demo.
 *
 * The point of these is to exercise the **sandbox tool bridge**: the harness
 * (Claude Code / Codex / OpenCode) runs INSIDE the sandbox, but these tools
 * execute on the HOST and their results are relayed back. If a run shows both
 * tool calls firing and returning data, the bridge round-trips correctly.
 *
 * Two flavours, on purpose:
 *  - `fetchIssueComments` — a NORMAL server tool the harness calls directly.
 *  - `searchRelatedIssues` — a CODE-MODE tool: the harness calls
 *    `execute_typescript` and the generated code invokes it as the bound
 *    function `external_searchRelatedIssues(...)` (host-run code mode).
 *
 * Both are bound to the run's repo/issue so the model can't pass the wrong
 * target — a more reliable bridge check.
 */
import { toolDefinition } from '@tanstack/ai'
import { createCodeMode } from '@tanstack/ai-code-mode'
import { createNodeIsolateDriver } from '@tanstack/ai-isolate-node'
import { z } from 'zod'

function githubHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'tanstack-ai-sandbox-triage',
  }
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`
  }
  return headers
}

/**
 * Build the bridged tools + code-mode setup + system mandate for one triage run.
 * `repo`/`issueNumber` are captured so the tools take minimal (or no) model
 * input — the bridge test doesn't hinge on the model echoing the right target.
 */
export function createTriageTools(repo: string, issueNumber: number) {
  // ── Normal bridged tool: host fetches the issue's comment thread ──────────
  const fetchIssueComments = toolDefinition({
    name: 'fetchIssueComments',
    description:
      `Fetch the human discussion thread on issue #${issueNumber} of ${repo} ` +
      'from the host. Comments often hold reproduction steps, stack traces, and ' +
      'maintainer hints that are not in the issue body. Takes no arguments.',
    inputSchema: z.object({}),
    outputSchema: z.object({
      count: z.number(),
      comments: z.array(
        z.object({
          author: z.string(),
          body: z.string(),
          createdAt: z.string(),
        }),
      ),
    }),
  }).server(async () => {
    const res = await fetch(
      `https://api.github.com/repos/${repo}/issues/${issueNumber}/comments?per_page=20`,
      { headers: githubHeaders() },
    )
    if (!res.ok) {
      throw new Error(
        `GitHub comments fetch failed: ${res.status} ${res.statusText}`,
      )
    }
    const data = (await res.json()) as Array<{
      user?: { login?: string }
      body?: string
      created_at?: string
    }>
    const comments = data.map((comment) => ({
      author: comment.user?.login ?? 'unknown',
      body: comment.body ?? '',
      createdAt: comment.created_at ?? '',
    }))
    return { count: comments.length, comments }
  })

  // ── Code-mode bound tool: host searches the repo for related issues ───────
  const searchRelatedIssues = toolDefinition({
    name: 'searchRelatedIssues',
    description:
      `Search ${repo} for issues matching a free-text query. Use it to find ` +
      'duplicates or related reports for the issue under triage.',
    inputSchema: z.object({
      query: z.string().describe('Free-text search terms.'),
    }),
    outputSchema: z.object({
      issues: z.array(
        z.object({
          number: z.number(),
          title: z.string(),
          state: z.string(),
          url: z.string(),
        }),
      ),
    }),
  }).server(async ({ query }) => {
    const q = encodeURIComponent(`repo:${repo} is:issue ${query}`)
    const res = await fetch(
      `https://api.github.com/search/issues?q=${q}&per_page=5`,
      { headers: githubHeaders() },
    )
    if (!res.ok) {
      throw new Error(`GitHub search failed: ${res.status} ${res.statusText}`)
    }
    const data = (await res.json()) as {
      items?: Array<{
        number: number
        title: string
        state: string
        html_url: string
      }>
    }
    const issues = (data.items ?? []).map((issue) => ({
      number: issue.number,
      title: issue.title,
      state: issue.state,
      url: issue.html_url,
    }))
    return { issues }
  })

  // Code mode runs the agent's generated TypeScript on the host; the bound
  // tool is exposed to that code as `external_searchRelatedIssues(...)`.
  const codeMode = createCodeMode({
    driver: createNodeIsolateDriver(),
    tools: [searchRelatedIssues],
    timeout: 60_000,
    memoryLimit: 128,
  })

  // System instruction: force BOTH bridged tools before any repo work, so a
  // broken bridge is immediately obvious (the run can't get past step 2).
  const mandate = [
    'Before you read, clone, or analyze ANY repository files, you MUST complete',
    'these two steps, in order:',
    '',
    '1. Call the `fetchIssueComments` tool (no arguments) to load the issue',
    '   discussion thread from the host.',
    '2. Call the `execute_typescript` tool with a short script that calls',
    '   `external_searchRelatedIssues({ query })` with a query derived from the',
    '   issue title, and returns its result. This runs your code on the host via',
    '   code mode.',
    '',
    'Only AFTER both tool calls have returned may you inspect the repository and',
    'produce your triage verdict. These tools execute on the host through the',
    'sandbox tool bridge — calling them confirms the bridge works end to end.',
  ].join('\n')

  return {
    /** The normal tool + the code-mode tools (`execute_typescript`, …). */
    tools: [fetchIssueComments, ...codeMode.tools],
    /** Code mode's own system prompt (explains `execute_typescript` usage). */
    codeModeSystemPrompt: codeMode.systemPrompt,
    /** Our mandate forcing both tools first. */
    mandate,
  }
}
