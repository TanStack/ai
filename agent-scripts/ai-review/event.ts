import type { GitHubClient } from '../../scripts/maintainer/github.ts'
import { fetchPullRequest } from './pr.ts'

export const AI_REVIEW_TRIGGER_LABEL = 'ai-review'

/**
 * Resolve any trigger to `{ parsed, pr }`. A `workflow_run` is resolved through
 * authenticated run and pull request metadata, never the event payload.
 */
export async function resolveReviewEvent(input: {
  eventName: string
  event: unknown
  client: GitHubClient
  repo: string
}) {
  if (input.eventName !== 'workflow_run') {
    const parsed = parseReviewEvent(input)
    const pr = await fetchPullRequest(input.client, input.repo, parsed.prNumber)
    return { parsed, pr }
  }
  const eventRun = isRecord(input.event) ? input.event.workflow_run : undefined
  const id = parsePrNumber(isRecord(eventRun) ? eventRun.id : undefined)
  if (id === null) throw new Error('workflow_run is missing a valid run ID')
  const run = await input.client.rest(
    'GET',
    `/repos/${input.repo}/actions/runs/${id}`,
  )
  const workflow = await input.client.rest(
    'GET',
    `/repos/${input.repo}/actions/workflows/ai-review-signal.yml`,
  )
  if (
    !isRecord(run) ||
    !isRecord(workflow) ||
    run.id !== id ||
    typeof workflow.id !== 'number' ||
    run.workflow_id !== workflow.id ||
    workflow.path !== '.github/workflows/ai-review-signal.yml' ||
    run.event !== 'pull_request' ||
    run.status !== 'completed' ||
    run.conclusion !== 'success' ||
    !isRecord(run.repository) ||
    run.repository.full_name !== input.repo ||
    !isRecord(run.head_repository) ||
    typeof run.head_repository.full_name !== 'string' ||
    !isRecord(run.head_repository.owner) ||
    typeof run.head_repository.owner.login !== 'string' ||
    typeof run.head_branch !== 'string' ||
    typeof run.head_sha !== 'string' ||
    !/^[0-9a-f]{40}$/i.test(run.head_sha)
  ) {
    throw new Error('workflow_run does not match the trusted signal workflow')
  }
  // The base repo's /commits/{sha}/pulls returns [] for a fork head, so list
  // by head instead. One head branch has at most one open PR into main.
  const head = encodeURIComponent(
    `${run.head_repository.owner.login}:${run.head_branch}`,
  )
  const batch = await input.client.rest(
    'GET',
    `/repos/${input.repo}/pulls?state=open&base=main&head=${head}&per_page=100`,
  )
  if (!Array.isArray(batch))
    throw new Error('Invalid workflow_run pull request list')
  const candidates = new Set<number>()
  for (const candidate of batch) {
    if (
      !isRecord(candidate) ||
      !isRecord(candidate.head) ||
      !isRecord(candidate.base) ||
      !isRecord(candidate.head.repo) ||
      !isRecord(candidate.base.repo)
    )
      throw new Error('Malformed workflow_run pull request')
    const number = parsePrNumber(candidate.number)
    if (
      number !== null &&
      candidate.state === 'open' &&
      candidate.base.ref === 'main' &&
      candidate.base.repo.full_name === input.repo &&
      candidate.head.sha === run.head_sha &&
      candidate.head.ref === run.head_branch &&
      candidate.head.repo.full_name === run.head_repository.full_name
    )
      candidates.add(number)
  }
  if (candidates.size !== 1)
    throw new Error('workflow_run has no unique current pull request')
  const prNumber = [...candidates][0]
  if (prNumber === undefined)
    throw new Error('Missing workflow_run pull request')
  const pr = await fetchPullRequest(input.client, input.repo, prNumber)
  if (
    pr.state !== 'open' ||
    pr.baseRepo !== input.repo ||
    pr.baseRef !== 'main' ||
    pr.headSha !== run.head_sha ||
    pr.headRef !== run.head_branch ||
    pr.headRepo !== run.head_repository.full_name
  )
    throw new Error('workflow_run pull request changed')
  return {
    parsed: {
      prNumber,
      mode: 'auto',
      commentAuthor: null,
      eventName: 'workflow_run',
    } satisfies ReviewEvent,
    pr,
  }
}

export type ReviewEvent = {
  prNumber: number
  mode: 'auto' | 'manual'
  commentAuthor: string | null
  eventName:
    | 'pull_request'
    | 'workflow_run'
    | 'workflow_dispatch'
    | 'issue_comment'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parsePrNumber(value: unknown) {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value
  }
  if (typeof value !== 'string' || value.length === 0) {
    return null
  }
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return null
  }
  return parsed
}

function readCommentAuthor(event: unknown) {
  const comment = isRecord(event) ? event.comment : undefined
  const user = isRecord(comment) ? comment.user : undefined
  if (!isRecord(user) || typeof user.login !== 'string') {
    return null
  }
  return user.login
}

function readSenderLogin(event: unknown) {
  const sender = isRecord(event) ? event.sender : undefined
  if (!isRecord(sender) || typeof sender.login !== 'string') {
    return null
  }
  return sender.login
}

function readAction(event: unknown) {
  return isRecord(event) && typeof event.action === 'string'
    ? event.action
    : null
}

function readEventLabelName(event: unknown) {
  const label = isRecord(event) ? event.label : undefined
  return isRecord(label) && typeof label.name === 'string' ? label.name : null
}

/** True when this `pull_request` event is someone adding the `ai-review` label. */
export function isAiReviewLabelEvent(event: unknown) {
  return (
    readAction(event) === 'labeled' &&
    readEventLabelName(event) === AI_REVIEW_TRIGGER_LABEL
  )
}

/** True when this `pull_request` event is any label add. */
export function isPullRequestLabeledEvent(event: unknown) {
  return readAction(event) === 'labeled'
}

/**
 * Parse a GitHub Actions event into the PR number and auto vs manual mode.
 *
 * No workflow sends `pull_request` now. It stays for local runs.
 * Always throws for `workflow_run`. Use `resolveReviewEvent`.
 * Also throws if `eventName` is unknown, `pull_request.number` is missing,
 * `workflow_dispatch` has no valid `inputs.pr_number`, or `issue_comment`
 * is not on a pull request.
 */
export function parseReviewEvent(input: { eventName: string; event: unknown }) {
  switch (input.eventName) {
    case 'pull_request': {
      const pullRequest = isRecord(input.event)
        ? input.event.pull_request
        : undefined
      const prNumber = parsePrNumber(
        isRecord(pullRequest) ? pullRequest.number : undefined,
      )
      if (prNumber === null) {
        throw new Error('pull_request event is missing pull_request.number')
      }
      return {
        prNumber,
        mode: isAiReviewLabelEvent(input.event) ? 'manual' : 'auto',
        commentAuthor: isAiReviewLabelEvent(input.event)
          ? readSenderLogin(input.event)
          : null,
        eventName: 'pull_request',
      } satisfies ReviewEvent
    }
    case 'workflow_run':
      throw new Error('workflow_run requires authenticated resolution')
    case 'workflow_dispatch': {
      const inputs = isRecord(input.event) ? input.event.inputs : undefined
      const prNumber = parsePrNumber(
        isRecord(inputs) ? inputs.pr_number : undefined,
      )
      if (prNumber === null) {
        throw new Error('workflow_dispatch is missing a valid inputs.pr_number')
      }
      return {
        prNumber,
        mode: 'manual',
        commentAuthor: null,
        eventName: 'workflow_dispatch',
      } satisfies ReviewEvent
    }
    case 'issue_comment': {
      const issue = isRecord(input.event) ? input.event.issue : undefined
      const isPrComment =
        isRecord(issue) &&
        issue.pull_request !== undefined &&
        issue.pull_request !== null
      if (!isPrComment) {
        throw new Error('issue_comment is not on a pull request')
      }
      const prNumber = parsePrNumber(issue.number)
      if (prNumber === null) {
        throw new Error('issue_comment is missing issue.number')
      }
      return {
        prNumber,
        mode: 'manual',
        commentAuthor: readCommentAuthor(input.event),
        eventName: 'issue_comment',
      } satisfies ReviewEvent
    }
    default:
      throw new Error(`Unknown GitHub event: ${input.eventName}`)
  }
}
