/**
 * One bot review comment per PR. HTML marker makes later runs edit the same
 * comment instead of posting a second copy.
 */

import type { GitHubClient } from '../../scripts/maintainer/github'

export const COMMENT_MARKER = '<!-- tanstack-ai-review-bot:v1 -->'

function parseIssueComment(value: unknown) {
  if (typeof value !== 'object' || value === null) return null
  if (!('id' in value) || !('body' in value)) return null
  if (typeof value.id !== 'number' || typeof value.body !== 'string') {
    return null
  }
  const user =
    'user' in value && typeof value.user === 'object' && value.user !== null
      ? value.user
      : null
  const userLogin =
    user !== null && 'login' in user && typeof user.login === 'string'
      ? user.login
      : null
  return { id: value.id, body: value.body, userLogin }
}

export function isBotReviewComment(
  comment: { body: string; userLogin: string | null },
  machineUserLogin: string,
) {
  return (
    comment.body.includes(COMMENT_MARKER) &&
    comment.userLogin !== null &&
    comment.userLogin.toLowerCase() === machineUserLogin.toLowerCase()
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
  machineUserLogin: string,
) {
  const listPath = `/repos/${repo}/issues/${issueNumber}/comments`
  const list = await client.rest('GET', listPath)
  if (!Array.isArray(list)) {
    throw new Error(`GitHub GET ${listPath} did not return an array`)
  }
  const comments = []
  for (const item of list) {
    const comment = parseIssueComment(item)
    if (comment !== null) comments.push(comment)
  }
  const existing = comments.find((comment) =>
    isBotReviewComment(comment, machineUserLogin),
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
