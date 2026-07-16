/**
 * Mutation planning + execution for the sweep. The sweep builds a plan of
 * `Mutation` objects first (printable in dry-run mode), then executes them
 * through the REST API.
 */

import type { GitHubClient } from './github'

export const MANAGED_LABELS: Array<{
  name: string
  color: string
  description: string
}> = [
  {
    name: 'waiting-on: maintainer',
    color: 'd93f0b',
    description: 'The ball is in the maintainers’ court',
  },
  {
    name: 'waiting-on: author',
    color: 'fbca04',
    description: 'Waiting for the author to respond or update',
  },
  {
    name: 'ready-to-merge',
    color: '0e8a16',
    description: 'Approved, CI green, no conflicts',
  },
  {
    name: 'needs-repro',
    color: 'e99695',
    description: 'Needs a minimal reproduction before it can be worked on',
  },
  {
    name: 'has-pr',
    color: 'bfd4f2',
    description: 'An open PR references this issue',
  },
]

const MANAGED_LABEL_NAMES = new Set(MANAGED_LABELS.map((l) => l.name))

export type Mutation =
  | { kind: 'assign'; number: number; assignee: string }
  | { kind: 'comment'; number: number; body: string; note: string }
  | { kind: 'add-labels'; number: number; labels: Array<string> }
  | { kind: 'remove-label'; number: number; label: string }

export function describeMutation(m: Mutation): string {
  switch (m.kind) {
    case 'assign':
      return `assign #${m.number} → @${m.assignee}`
    case 'comment':
      return `comment on #${m.number} (${m.note})`
    case 'add-labels':
      return `label #${m.number} + [${m.labels.join(', ')}]`
    case 'remove-label':
      return `label #${m.number} − [${m.label}]`
  }
}

/**
 * Diff an item's current labels against the desired managed labels; labels
 * outside MANAGED_LABELS are never touched.
 */
export function planLabelChanges(
  number: number,
  currentLabels: Array<string>,
  desiredManaged: Array<string>,
): Array<Mutation> {
  const current = new Set(
    currentLabels.filter((l) => MANAGED_LABEL_NAMES.has(l)),
  )
  const desired = new Set(desiredManaged)
  const mutations: Array<Mutation> = []
  const toAdd = [...desired].filter((l) => !current.has(l))
  if (toAdd.length > 0) {
    mutations.push({ kind: 'add-labels', number, labels: toAdd })
  }
  for (const label of current) {
    if (!desired.has(label)) {
      mutations.push({ kind: 'remove-label', number, label })
    }
  }
  return mutations
}

export async function ensureManagedLabels(
  client: GitHubClient,
  repo: string,
): Promise<void> {
  for (const label of MANAGED_LABELS) {
    try {
      await client.rest('POST', `/repos/${repo}/labels`, label)
    } catch (error) {
      // 422 = already exists; anything else should surface.
      if (!(error instanceof Error) || !error.message.includes('422')) {
        throw error
      }
    }
  }
}

export async function executeMutations(
  client: GitHubClient,
  repo: string,
  mutations: Array<Mutation>,
): Promise<void> {
  for (const m of mutations) {
    switch (m.kind) {
      case 'assign':
        await client.rest(
          'POST',
          `/repos/${repo}/issues/${m.number}/assignees`,
          {
            assignees: [m.assignee],
          },
        )
        break
      case 'comment':
        await client.rest(
          'POST',
          `/repos/${repo}/issues/${m.number}/comments`,
          {
            body: m.body,
          },
        )
        break
      case 'add-labels':
        await client.rest('POST', `/repos/${repo}/issues/${m.number}/labels`, {
          labels: m.labels,
        })
        break
      case 'remove-label':
        await client.rest(
          'DELETE',
          `/repos/${repo}/issues/${m.number}/labels/${encodeURIComponent(m.label)}`,
        )
        break
    }
  }
}
