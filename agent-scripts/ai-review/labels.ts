/**
 * Mutually exclusive bot-review labels. Separate from maintainer
 * `ready-to-merge` and `waiting-on:*` labels, which this module never
 * touches.
 */

import type { GitHubClient } from '../../scripts/maintainer/github.ts'

export const REVIEW_LABELS = [
  {
    name: 'ai-rejected',
    color: 'b60205',
    description: 'Grok review bot: not useful, or does not fix the claimed bug',
  },
  {
    name: 'ai-needs-work',
    color: 'fbca04',
    description: 'Grok review bot: listed fixes are not on the branch yet',
  },
  {
    name: 'ai-ready',
    color: '0e8a16',
    description: 'Grok review bot: a maintainer can merge after they Approve',
  },
] as const

type ReviewState = (typeof REVIEW_LABELS)[number]['name']

function errorMentionsStatus(error: unknown, status: string) {
  return error instanceof Error && error.message.includes(status)
}

/**
 * Set the bot review state on an issue or PR.
 *
 * Creates the `ai-*` labels if they are missing, removes the other two from
 * the issue, then adds `state`. Never touches `ready-to-merge` or
 * `waiting-on:*`.
 *
 * @param client GitHub REST client
 * @param repo owner/name, for example `TanStack/ai`
 * @param issueNumber issue or pull request number
 * @param state one of `ai-rejected`, `ai-needs-work`, `ai-ready`
 */
export async function setReviewState(
  client: GitHubClient,
  repo: string,
  issueNumber: number,
  state: ReviewState,
) {
  for (const label of REVIEW_LABELS) {
    try {
      await client.rest('POST', `/repos/${repo}/labels`, label)
    } catch (error) {
      // 422 = already exists; anything else should surface.
      if (!errorMentionsStatus(error, '422')) throw error
    }
  }

  const others = REVIEW_LABELS.filter((label) => label.name !== state)
  for (const label of others) {
    try {
      await client.rest(
        'DELETE',
        `/repos/${repo}/issues/${issueNumber}/labels/${encodeURIComponent(label.name)}`,
      )
    } catch (error) {
      // 404 = not on the issue; anything else should surface.
      if (!errorMentionsStatus(error, '404')) throw error
    }
  }

  await client.rest('POST', `/repos/${repo}/issues/${issueNumber}/labels`, {
    labels: [state],
  })
}
