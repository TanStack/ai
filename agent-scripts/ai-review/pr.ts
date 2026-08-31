/**
 * Load pull request metadata and changed files from GitHub REST.
 */

import type { GitHubClient } from '../../scripts/maintainer/github.ts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fail(path: string, message: string): never {
  throw new Error(`GitHub GET ${path} ${message}`)
}

function parseAuthorLogin(user: unknown, path: string) {
  if (user === null) return null
  if (!isRecord(user) || typeof user.login !== 'string') {
    fail(path, 'is missing user.login')
  }
  return user.login
}

function parseLabelNames(labels: unknown, path: string) {
  if (!Array.isArray(labels)) fail(path, 'is missing labels')
  const names = []
  for (const label of labels) {
    if (!isRecord(label) || typeof label.name !== 'string') {
      fail(path, 'has a label without name')
    }
    names.push(label.name)
  }
  return names
}

function parseHead(head: unknown, path: string) {
  if (!isRecord(head)) fail(path, 'is missing head')
  if (typeof head.sha !== 'string') fail(path, 'is missing head.sha')
  if (typeof head.ref !== 'string') fail(path, 'is missing head.ref')
  if (!isRecord(head.repo)) fail(path, 'is missing head.repo')
  if (typeof head.repo.full_name !== 'string') {
    fail(path, 'is missing head.repo.full_name')
  }
  return {
    sha: head.sha,
    ref: head.ref,
    repo: head.repo.full_name,
  }
}

function parsePull(raw: unknown, path: string) {
  if (!isRecord(raw)) fail(path, 'did not return an object')
  if (typeof raw.number !== 'number') fail(path, 'is missing number')
  if (typeof raw.title !== 'string') fail(path, 'is missing title')
  if (raw.body !== null && typeof raw.body !== 'string') {
    fail(path, 'is missing body')
  }
  if (typeof raw.html_url !== 'string') fail(path, 'is missing html_url')
  if (typeof raw.draft !== 'boolean') fail(path, 'is missing draft')
  if (typeof raw.maintainer_can_modify !== 'boolean') {
    fail(path, 'is missing maintainer_can_modify')
  }
  const head = parseHead(raw.head, path)
  return {
    number: raw.number,
    title: raw.title,
    body: raw.body,
    htmlUrl: raw.html_url,
    isDraft: raw.draft,
    authorLogin: parseAuthorLogin(raw.user, path),
    headSha: head.sha,
    headRef: head.ref,
    headRepo: head.repo,
    maintainerCanModify: raw.maintainer_can_modify,
    labels: parseLabelNames(raw.labels, path),
  }
}

function parseFiles(raw: unknown, path: string) {
  if (!Array.isArray(raw)) fail(path, 'did not return an array')
  const files = []
  for (const item of raw) {
    if (!isRecord(item) || typeof item.filename !== 'string') {
      fail(path, 'has a file without filename')
    }
    const patch = typeof item.patch === 'string' ? item.patch : null
    files.push({ path: item.filename, patch })
  }
  return files
}

/**
 * List changed files for a pull request.
 *
 * `patch` is null when GitHub omits it (binary or too large).
 *
 * @param client GitHub REST client
 * @param repo owner/name, for example `TanStack/ai`
 * @param number pull request number
 */
export async function fetchPullRequestFiles(
  client: GitHubClient,
  repo: string,
  number: number,
) {
  const path = `/repos/${repo}/pulls/${number}/files`
  return parseFiles(await client.rest('GET', path), path)
}

/**
 * Unified-ish diff from each file's `patch` field.
 *
 * @param client GitHub REST client
 * @param repo owner/name, for example `TanStack/ai`
 * @param number pull request number
 */
export async function fetchPullRequestDiff(
  client: GitHubClient,
  repo: string,
  number: number,
) {
  // ponytail: GitHubClient always Accepts JSON, so the diff is files[].patch joined
  const files = await fetchPullRequestFiles(client, repo, number)
  const parts = []
  for (const file of files) {
    if (file.patch === null) continue
    parts.push(`--- a/${file.path}\n${file.patch}`)
  }
  return parts.join('\n')
}

/**
 * Load pull request metadata and changed files.
 *
 * @param client GitHub REST client
 * @param repo owner/name, for example `TanStack/ai`
 * @param number pull request number
 */
export async function fetchPullRequest(
  client: GitHubClient,
  repo: string,
  number: number,
) {
  const path = `/repos/${repo}/pulls/${number}`
  const pull = parsePull(await client.rest('GET', path), path)
  const files = await fetchPullRequestFiles(client, repo, number)
  return { ...pull, files }
}
