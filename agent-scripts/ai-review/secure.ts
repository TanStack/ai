/**
 * Mark a PR `secure` and approve waiting first-time-contributor workflow runs.
 */

import type { GitHubClient } from '../../scripts/maintainer/github.ts'

export const SECURE_LABEL = {
  name: 'secure',
  color: '0e8a16',
  description: 'AI review: no malware found. Waiting workflows were approved.',
} as const

function errorMentionsStatus(error: unknown, status: string) {
  return error instanceof Error && error.message.includes(status)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseRunIds(raw: unknown, path: string) {
  if (!isRecord(raw) || !Array.isArray(raw.workflow_runs)) {
    throw new Error(`GitHub GET ${path} is missing workflow_runs`)
  }
  const ids = []
  for (const run of raw.workflow_runs) {
    if (!isRecord(run) || typeof run.id !== 'number') {
      throw new Error(`GitHub GET ${path} has a run without id`)
    }
    ids.push(run.id)
  }
  return ids
}

/**
 * Add or remove the `secure` label. Creates the repo label if it is missing.
 */
export async function setSecureLabel(
  client: GitHubClient,
  repo: string,
  issueNumber: number,
  on: boolean,
) {
  try {
    await client.rest('POST', `/repos/${repo}/labels`, SECURE_LABEL)
  } catch (error) {
    if (!errorMentionsStatus(error, '422')) throw error
  }

  const issuePath = `/repos/${repo}/issues/${issueNumber}/labels/${encodeURIComponent(SECURE_LABEL.name)}`
  if (!on) {
    try {
      await client.rest('DELETE', issuePath)
    } catch (error) {
      if (!errorMentionsStatus(error, '404')) throw error
    }
    return
  }

  await client.rest('POST', `/repos/${repo}/issues/${issueNumber}/labels`, {
    labels: [SECURE_LABEL.name],
  })
}

/**
 * Approve workflow runs on this head SHA that wait for first-time-contributor
 * approval. Returns how many approve calls succeeded.
 */
export async function approveWaitingWorkflows(
  client: GitHubClient,
  repo: string,
  headSha: string,
) {
  const statuses = ['waiting', 'action_required']
  const ids = new Set<number>()
  for (const status of statuses) {
    const path = `/repos/${repo}/actions/runs?head_sha=${encodeURIComponent(headSha)}&status=${status}&per_page=100`
    const batch = parseRunIds(await client.rest('GET', path), path)
    for (const id of batch) ids.add(id)
  }

  let approved = 0
  for (const id of ids) {
    await client.rest('POST', `/repos/${repo}/actions/runs/${id}/approve`)
    approved += 1
  }
  return approved
}
