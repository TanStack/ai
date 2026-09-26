/**
 * Load and validate pull request metadata from GitHub REST. Changed files
 * come from the Git snapshot in `git.ts`.
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
  if (typeof head.sha !== 'string' || !/^[0-9a-f]{40}$/i.test(head.sha)) {
    fail(path, 'is missing a valid head.sha')
  }
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

function parseBase(base: unknown, path: string) {
  if (!isRecord(base)) fail(path, 'is missing base')
  if (typeof base.sha !== 'string' || !/^[0-9a-f]{40}$/i.test(base.sha)) {
    fail(path, 'is missing a valid base.sha')
  }
  if (typeof base.ref !== 'string') fail(path, 'is missing base.ref')
  if (!isRecord(base.repo) || typeof base.repo.full_name !== 'string')
    fail(path, 'is missing base.repo.full_name')
  return { sha: base.sha, ref: base.ref, repo: base.repo.full_name }
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
  const base = parseBase(raw.base, path)
  return {
    number: raw.number,
    title: raw.title,
    body: raw.body,
    htmlUrl: raw.html_url,
    isDraft: raw.draft,
    authorLogin: parseAuthorLogin(raw.user, path),
    baseSha: base.sha,
    baseRef: base.ref,
    baseRepo: base.repo,
    state: raw.state,
    headSha: head.sha,
    headRef: head.ref,
    headRepo: head.repo,
    maintainerCanModify: raw.maintainer_can_modify,
    labels: parseLabelNames(raw.labels, path),
  }
}

/** Load pull metadata. Changed files come only from the fixed Git snapshot. */
export async function fetchPullRequest(
  client: GitHubClient,
  repo: string,
  number: number,
) {
  const path = `/repos/${repo}/pulls/${number}`
  const pull = parsePull(await client.rest('GET', path), path)
  return pull
}
