/**
 * Snapshot collection: pulls open PRs/issues/discussions (with timelines) and
 * recently closed items from the GitHub GraphQL API and normalizes them into
 * the shapes in types.ts. Read-only — never mutates anything.
 */

import { isBotLogin } from './config'
import type { GitHubClient } from './github'
import type {
  CIState,
  ClosedItem,
  DiscussionItem,
  IssueItem,
  PRItem,
  RepoSnapshot,
  TimelineEvent,
  ToolsetConfig,
} from './types'

const CLOSED_LOOKBACK_DAYS = 14

interface GqlActor {
  login?: string
  __typename?: string
  createdAt?: string
}

interface GqlTimelineNode {
  __typename: string
  author?: GqlActor | null
  createdAt?: string
  submittedAt?: string
  state?: string
  body?: string
  commit?: {
    committedDate: string
    author?: { user?: { login: string } | null } | null
  } | null
}

function actorLogin(actor: GqlActor | null | undefined): string | null {
  return actor?.login ?? null
}

function actorIsBot(
  actor: GqlActor | null | undefined,
  config: ToolsetConfig,
): boolean {
  if (actor?.__typename === 'Bot') return true
  return isBotLogin(actorLogin(actor), config)
}

function normalizeTimeline(
  nodes: Array<GqlTimelineNode | null>,
  fallbackAuthor: string | null,
  config: ToolsetConfig,
): Array<TimelineEvent> {
  const events: Array<TimelineEvent> = []
  for (const node of nodes) {
    if (!node) continue
    if (node.__typename === 'IssueComment' && node.createdAt) {
      events.push({
        kind: 'comment',
        actor: actorLogin(node.author),
        isBot: actorIsBot(node.author, config),
        at: node.createdAt,
        body: node.body ?? '',
      })
    } else if (node.__typename === 'PullRequestReview' && node.submittedAt) {
      events.push({
        kind: 'review',
        actor: actorLogin(node.author),
        isBot: actorIsBot(node.author, config),
        at: node.submittedAt,
        reviewState: node.state,
      })
    } else if (node.__typename === 'PullRequestCommit' && node.commit) {
      const login = node.commit.author?.user?.login ?? fallbackAuthor
      events.push({
        kind: 'commit',
        actor: login,
        isBot: isBotLogin(login, config),
        at: node.commit.committedDate,
      })
    }
  }
  return events
}

function normalizeCIState(state: string | null | undefined): CIState {
  switch (state) {
    case 'SUCCESS':
      return 'success'
    case 'FAILURE':
    case 'ERROR':
      return 'failure'
    case 'PENDING':
    case 'EXPECTED':
      return 'pending'
    default:
      return 'unknown'
  }
}

const COMMENT_FRAGMENT = `
  __typename
  ... on IssueComment { author { login __typename } createdAt body }
`

const PR_TIMELINE_FRAGMENT = `
  ${COMMENT_FRAGMENT}
  ... on PullRequestReview { author { login __typename } submittedAt state }
  ... on PullRequestCommit { commit { committedDate author { user { login } } } }
`

const OPEN_PRS_QUERY = `
query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    pullRequests(states: OPEN, first: 20, after: $cursor, orderBy: {field: CREATED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number title url createdAt updatedAt isDraft mergeable reviewDecision
        additions deletions changedFiles authorAssociation
        author { login __typename ... on User { createdAt } }
        labels(first: 20) { nodes { name } }
        assignees(first: 10) { nodes { login } }
        files(first: 100) { nodes { path } }
        closingIssuesReferences(first: 10) { nodes { number } }
        commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
        timelineItems(last: 100, itemTypes: [ISSUE_COMMENT, PULL_REQUEST_REVIEW, PULL_REQUEST_COMMIT]) {
          nodes { ${PR_TIMELINE_FRAGMENT} }
        }
      }
    }
  }
}`

const OPEN_ISSUES_QUERY = `
query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    issues(states: OPEN, first: 40, after: $cursor, orderBy: {field: CREATED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number title url createdAt updatedAt body authorAssociation
        author { login __typename }
        labels(first: 20) { nodes { name } }
        assignees(first: 10) { nodes { login } }
        timelineItems(last: 100, itemTypes: [ISSUE_COMMENT]) {
          nodes { ${COMMENT_FRAGMENT} }
        }
      }
    }
  }
}`

const DISCUSSIONS_QUERY = `
query($owner: String!, $name: String!, $cursor: String) {
  repository(owner: $owner, name: $name) {
    discussions(first: 50, after: $cursor, states: OPEN, orderBy: {field: UPDATED_AT, direction: DESC}) {
      pageInfo { hasNextPage endCursor }
      nodes {
        number title url createdAt updatedAt isAnswered upvoteCount
        category { name }
        author { login __typename }
        comments(last: 20) {
          totalCount
          nodes { author { login __typename } createdAt }
        }
      }
    }
  }
}`

const CLOSED_SEARCH_QUERY = `
query($query: String!, $cursor: String) {
  search(query: $query, type: ISSUE, first: 50, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    nodes {
      __typename
      ... on PullRequest {
        number title url createdAt closedAt mergedAt
        author { login __typename }
        timelineItems(first: 30, itemTypes: [ISSUE_COMMENT, PULL_REQUEST_REVIEW]) {
          nodes { ${PR_TIMELINE_FRAGMENT} }
        }
      }
      ... on Issue {
        number title url createdAt closedAt
        author { login __typename }
        timelineItems(first: 30, itemTypes: [ISSUE_COMMENT]) {
          nodes { ${COMMENT_FRAGMENT} }
        }
      }
    }
  }
}`

async function paginate<TNode>(
  fetchPage: (cursor: string | null) => Promise<{
    nodes: Array<TNode | null>
    pageInfo: { hasNextPage: boolean; endCursor: string | null }
  }>,
  maxPages = 20,
): Promise<Array<TNode>> {
  const all: Array<TNode> = []
  let cursor: string | null = null
  for (let page = 0; page < maxPages; page++) {
    const result = await fetchPage(cursor)
    for (const node of result.nodes) if (node !== null) all.push(node)
    if (!result.pageInfo.hasNextPage) break
    cursor = result.pageInfo.endCursor
  }
  return all
}

export async function collectSnapshot(
  client: GitHubClient,
  config: ToolsetConfig,
  now: Date = new Date(),
): Promise<RepoSnapshot> {
  const [owner, repo] = config.repo.split('/') as [string, string]
  const vars = { owner, name: repo }

  interface Connection {
    nodes: Array<Record<string, any> | null>
    pageInfo: { hasNextPage: boolean; endCursor: string | null }
  }

  const prNodes = await paginate((cursor) =>
    client
      .graphql<{ repository: { pullRequests: Connection } }>(OPEN_PRS_QUERY, {
        ...vars,
        cursor,
      })
      .then((d) => d.repository.pullRequests),
  )

  const issueNodes = await paginate((cursor) =>
    client
      .graphql<{ repository: { issues: Connection } }>(OPEN_ISSUES_QUERY, {
        ...vars,
        cursor,
      })
      .then((d) => d.repository.issues),
  )

  const discussionNodes = await paginate(
    (cursor) =>
      client
        .graphql<{
          repository: { discussions: Connection }
        }>(DISCUSSIONS_QUERY, { ...vars, cursor })
        .then((d) => d.repository.discussions),
    4,
  )

  const sinceDate = new Date(
    now.getTime() - CLOSED_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  )
    .toISOString()
    .slice(0, 10)
  const closedNodes = await paginate(
    (cursor) =>
      client
        .graphql<{ search: Connection }>(CLOSED_SEARCH_QUERY, {
          query: `repo:${config.repo} closed:>=${sinceDate}`,
          cursor,
        })
        .then((d) => d.search),
    10,
  )

  const prs: Array<PRItem> = prNodes.map((n) => {
    const author = actorLogin(n.author)
    return {
      type: 'pr',
      number: n.number,
      title: n.title,
      url: n.url,
      author,
      authorIsBot: actorIsBot(n.author, config),
      authorAccountCreatedAt: n.author?.createdAt ?? null,
      authorAssociation: n.authorAssociation ?? 'NONE',
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
      isDraft: Boolean(n.isDraft),
      mergeable: n.mergeable ?? 'UNKNOWN',
      reviewDecision: n.reviewDecision ?? '',
      additions: n.additions ?? 0,
      deletions: n.deletions ?? 0,
      changedFiles: n.changedFiles ?? 0,
      files: (n.files?.nodes ?? [])
        .filter(Boolean)
        .map((f: { path: string }) => f.path),
      labels: (n.labels?.nodes ?? [])
        .filter(Boolean)
        .map((l: { name: string }) => l.name),
      assignees: (n.assignees?.nodes ?? [])
        .filter(Boolean)
        .map((a: { login: string }) => a.login),
      ciState: normalizeCIState(
        n.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state,
      ),
      linkedIssues: (n.closingIssuesReferences?.nodes ?? [])
        .filter(Boolean)
        .map((i: { number: number }) => i.number),
      timeline: normalizeTimeline(n.timelineItems?.nodes ?? [], author, config),
    }
  })

  const issues: Array<IssueItem> = issueNodes.map((n) => ({
    type: 'issue',
    number: n.number,
    title: n.title,
    url: n.url,
    author: actorLogin(n.author),
    authorIsBot: actorIsBot(n.author, config),
    authorAssociation: n.authorAssociation ?? 'NONE',
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    body: n.body ?? '',
    labels: (n.labels?.nodes ?? [])
      .filter(Boolean)
      .map((l: { name: string }) => l.name),
    assignees: (n.assignees?.nodes ?? [])
      .filter(Boolean)
      .map((a: { login: string }) => a.login),
    timeline: normalizeTimeline(
      n.timelineItems?.nodes ?? [],
      actorLogin(n.author),
      config,
    ),
  }))

  const discussions: Array<DiscussionItem> = discussionNodes.map((n) => ({
    type: 'discussion',
    number: n.number,
    title: n.title,
    url: n.url,
    author: actorLogin(n.author),
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
    isAnswered: Boolean(n.isAnswered),
    category: n.category?.name ?? '',
    upvotes: n.upvoteCount ?? 0,
    commentCount: n.comments?.totalCount ?? 0,
    comments: (n.comments?.nodes ?? [])
      .filter(Boolean)
      .map((c: { author: GqlActor | null; createdAt: string }) => ({
        actor: actorLogin(c.author),
        isBot: actorIsBot(c.author, config),
        at: c.createdAt,
      })),
  }))

  const recentlyClosed: Array<ClosedItem> = closedNodes
    .filter((n) => n.closedAt)
    .map((n) => ({
      type:
        n.__typename === 'PullRequest' ? ('pr' as const) : ('issue' as const),
      number: n.number,
      title: n.title,
      url: n.url,
      author: actorLogin(n.author),
      authorIsBot: actorIsBot(n.author, config),
      createdAt: n.createdAt,
      closedAt: n.closedAt,
      mergedAt: n.mergedAt ?? null,
      timeline: normalizeTimeline(
        n.timelineItems?.nodes ?? [],
        actorLogin(n.author),
        config,
      ),
    }))

  return {
    owner,
    repo,
    takenAt: now.toISOString(),
    prs,
    issues,
    discussions,
    recentlyClosed,
  }
}
