export type ReviewEvent = {
  prNumber: number
  mode: 'auto' | 'manual'
  commentAuthor: string | null
  eventName: 'pull_request' | 'workflow_dispatch' | 'issue_comment'
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

/**
 * Parse a GitHub Actions event into the PR number and auto vs manual mode.
 *
 * Throws if `eventName` is unknown, `workflow_dispatch` has no valid
 * `inputs.pr_number`, or `issue_comment` is not on a pull request.
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
        mode: 'auto',
        commentAuthor: null,
        eventName: 'pull_request',
      } satisfies ReviewEvent
    }
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
