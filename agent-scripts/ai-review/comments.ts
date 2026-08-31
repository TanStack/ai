/**
 * One bot review comment per PR. HTML marker makes later runs edit the same
 * comment instead of posting a second copy.
 */

import type { GitHubClient } from '../../scripts/maintainer/github'

export const COMMENT_MARKER = '<!-- tanstack-ai-review-bot:v1 -->'

function isIssueComment(value: unknown): value is { id: number; body: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'body' in value &&
    typeof value.id === 'number' &&
    typeof value.body === 'string'
  )
}

export function buildReviewComment(input: {
  verdict: 'reject' | 'polish' | 'ready'
  headSha: string
  findings: Array<string>
  pushNote: string
  label: 'ai-rejected' | 'ai-needs-work' | 'ai-ready'
}) {
  const findingLines =
    input.findings.length === 0
      ? '- None'
      : input.findings.map((finding) => `- ${finding}`).join('\n')
  return [
    'This comment is automated by a Grok agent. It is not a maintainer review.',
    '',
    `**Verdict:** ${input.verdict}`,
    `**Head SHA:** ${input.headSha}`,
    `**Label:** \`${input.label}\``,
    '',
    '**Findings**',
    findingLines,
    '',
    '**Push**',
    input.pushNote,
    '',
    'Maintainers still GitHub-approve.',
    COMMENT_MARKER,
  ].join('\n')
}

export async function upsertReviewComment(
  client: GitHubClient,
  repo: string,
  issueNumber: number,
  body: string,
) {
  const listPath = `/repos/${repo}/issues/${issueNumber}/comments`
  const list = await client.rest('GET', listPath)
  if (!Array.isArray(list)) {
    throw new Error(`GitHub GET ${listPath} did not return an array`)
  }
  const comments = list.filter(isIssueComment)
  const existing = comments.find((comment) =>
    comment.body.includes(COMMENT_MARKER),
  )
  if (existing) {
    await client.rest(
      'PATCH',
      `/repos/${repo}/issues/comments/${existing.id}`,
      {
        body,
      },
    )
    return
  }
  await client.rest('POST', listPath, { body })
}
