import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const GITHUB_API_BASE = 'https://api.github.com'
const FETCH_TIMEOUT = 15000 // 15 second timeout per request

function getGitHubHeaders(): HeadersInit {
  const token = process.env.GITHUB_TOKEN
  if (!token) {
    throw new Error('GITHUB_TOKEN environment variable is required')
  }
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

/**
 * Fetch with timeout - prevents hanging on network issues
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    return response
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timed out after ${FETCH_TIMEOUT}ms`)
    }
    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}

// Schema definitions for reuse
const repoSchema = z.object({
  id: z.number(),
  name: z.string(),
  full_name: z.string(),
  description: z.string().nullable(),
  stargazers_count: z.number(),
  forks_count: z.number(),
  updated_at: z.string(),
  pushed_at: z.string(),
  language: z.string().nullable(),
  topics: z.array(z.string()),
})

const repoDetailSchema = z.object({
  id: z.number(),
  name: z.string(),
  full_name: z.string(),
  description: z.string().nullable(),
  stargazers_count: z.number(),
  forks_count: z.number(),
  watchers_count: z.number(),
  open_issues_count: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  pushed_at: z.string(),
  subscribers_count: z.number(),
  license: z
    .object({
      name: z.string(),
    })
    .nullable(),
})

const releaseSchema = z.object({
  id: z.number(),
  tag_name: z.string(),
  name: z.string().nullable(),
  body: z.string().nullable(),
  published_at: z.string(),
  prerelease: z.boolean(),
  draft: z.boolean(),
})

const contributorSchema = z.object({
  login: z.string(),
  contributions: z.number(),
  avatar_url: z.string(),
})

// 1. Get starred repositories for a user
export const getStarredReposTool = toolDefinition({
  name: 'getStarredRepos',
  description:
    'Fetch GitHub starred repositories for a user. Returns repos with star counts, languages, and activity dates.',
  inputSchema: z.object({
    username: z.string().describe('GitHub username'),
    perPage: z.number().optional().default(100).describe('Results per page'),
    page: z.number().optional().default(1).describe('Page number'),
  }),
  outputSchema: z.array(repoSchema),
}).server(async ({ username, perPage = 100, page = 1 }) => {
  const url = `${GITHUB_API_BASE}/users/${username}/starred?per_page=${perPage}&page=${page}`
  const response = await fetchWithTimeout(url, { headers: getGitHubHeaders() })

  if (!response.ok) {
    throw new Error(
      `GitHub API error: ${response.status} ${response.statusText}`,
    )
  }

  const data = await response.json()
  return data.map((repo: Record<string, unknown>) => ({
    id: repo.id,
    name: repo.name,
    full_name: repo.full_name,
    description: repo.description,
    stargazers_count: repo.stargazers_count,
    forks_count: repo.forks_count,
    updated_at: repo.updated_at,
    pushed_at: repo.pushed_at,
    language: repo.language,
    topics: repo.topics || [],
  }))
})

// 2. Get detailed repository information
export const getRepoDetailsTool = toolDefinition({
  name: 'getRepoDetails',
  description:
    'Get detailed information about a specific GitHub repository including stars, forks, issues, and license.',
  inputSchema: z.object({
    owner: z.string().describe('Repository owner (user or org)'),
    repo: z.string().describe('Repository name'),
  }),
  outputSchema: repoDetailSchema,
}).server(async ({ owner, repo }) => {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}`
  const response = await fetchWithTimeout(url, { headers: getGitHubHeaders() })

  if (!response.ok) {
    throw new Error(
      `GitHub API error: ${response.status} ${response.statusText}`,
    )
  }

  const data = await response.json()
  return {
    id: data.id,
    name: data.name,
    full_name: data.full_name,
    description: data.description,
    stargazers_count: data.stargazers_count,
    forks_count: data.forks_count,
    watchers_count: data.watchers_count,
    open_issues_count: data.open_issues_count,
    created_at: data.created_at,
    updated_at: data.updated_at,
    pushed_at: data.pushed_at,
    subscribers_count: data.subscribers_count,
    license: data.license ? { name: data.license.name } : null,
  }
})

// 3. Get repository releases
export const getRepoReleasesTool = toolDefinition({
  name: 'getRepoReleases',
  description:
    'Get releases for a repository including version tags, release notes, and publish dates.',
  inputSchema: z.object({
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
    perPage: z.number().optional().default(30).describe('Results per page'),
  }),
  outputSchema: z.array(releaseSchema),
}).server(async ({ owner, repo, perPage = 30 }) => {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/releases?per_page=${perPage}`
  const response = await fetchWithTimeout(url, { headers: getGitHubHeaders() })

  if (!response.ok) {
    throw new Error(
      `GitHub API error: ${response.status} ${response.statusText}`,
    )
  }

  const data = await response.json()
  return data.map((release: Record<string, unknown>) => ({
    id: release.id,
    tag_name: release.tag_name,
    name: release.name,
    body: release.body,
    published_at: release.published_at,
    prerelease: release.prerelease,
    draft: release.draft,
  }))
})

// 4. Get repository contributors
export const getRepoContributorsTool = toolDefinition({
  name: 'getRepoContributors',
  description:
    'Get top contributors for a repository with their contribution counts.',
  inputSchema: z.object({
    owner: z.string().describe('Repository owner'),
    repo: z.string().describe('Repository name'),
    perPage: z.number().optional().default(30).describe('Results per page'),
  }),
  outputSchema: z.array(contributorSchema),
}).server(async ({ owner, repo, perPage = 30 }) => {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/contributors?per_page=${perPage}`
  const response = await fetchWithTimeout(url, { headers: getGitHubHeaders() })

  if (!response.ok) {
    throw new Error(
      `GitHub API error: ${response.status} ${response.statusText}`,
    )
  }

  const data = await response.json()
  return data.map((contributor: Record<string, unknown>) => ({
    login: contributor.login,
    contributions: contributor.contributions,
    avatar_url: contributor.avatar_url,
  }))
})

// 5. Search GitHub repositories
export const searchRepositoriesTool = toolDefinition({
  name: 'searchRepositories',
  description:
    'Search GitHub repositories by query. Supports language filters, sorting by stars/forks/updated.',
  inputSchema: z.object({
    query: z
      .string()
      .describe('Search query (e.g., "tanstack language:typescript")'),
    sort: z
      .enum(['stars', 'forks', 'updated'])
      .optional()
      .describe('Sort field'),
    order: z.enum(['asc', 'desc']).optional().default('desc').describe('Order'),
    perPage: z.number().optional().default(30).describe('Results per page'),
  }),
  outputSchema: z.object({
    total_count: z.number(),
    items: z.array(
      z.object({
        id: z.number(),
        name: z.string(),
        full_name: z.string(),
        description: z.string().nullable(),
        stargazers_count: z.number(),
        forks_count: z.number(),
        language: z.string().nullable(),
      }),
    ),
  }),
}).server(async ({ query, sort, order = 'desc', perPage = 30 }) => {
  let url = `${GITHUB_API_BASE}/search/repositories?q=${encodeURIComponent(query)}&per_page=${perPage}&order=${order}`
  if (sort) {
    url += `&sort=${sort}`
  }

  const response = await fetchWithTimeout(url, { headers: getGitHubHeaders() })

  if (!response.ok) {
    throw new Error(
      `GitHub API error: ${response.status} ${response.statusText}`,
    )
  }

  const data = await response.json()
  return {
    total_count: data.total_count,
    items: data.items.map((item: Record<string, unknown>) => ({
      id: item.id,
      name: item.name,
      full_name: item.full_name,
      description: item.description,
      stargazers_count: item.stargazers_count,
      forks_count: item.forks_count,
      language: item.language,
    })),
  }
})

// Export all GitHub tools as a collection
export const githubTools = [
  getStarredReposTool,
  getRepoDetailsTool,
  getRepoReleasesTool,
  getRepoContributorsTool,
  searchRepositoriesTool,
]
