import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

const NPM_API_BASE = 'https://api.npmjs.org'
const NPM_REGISTRY = 'https://registry.npmjs.org'
const FETCH_TIMEOUT = 15000 // 15 second timeout per request

/**
 * Fetch with timeout - prevents hanging on network issues
 */
async function fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
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

// 1. Get NPM download counts for a period
export const getNpmDownloadsTool = toolDefinition({
  name: 'getNpmDownloads',
  description:
    'Get total NPM package download counts for a period (last-day, last-week, last-month, last-year).',
  inputSchema: z.object({
    packageName: z.string().describe('Package name (e.g., "@tanstack/query")'),
    period: z
      .enum(['last-day', 'last-week', 'last-month', 'last-year'])
      .default('last-month')
      .describe('Time period'),
  }),
  outputSchema: z.object({
    downloads: z.number(),
    start: z.string(),
    end: z.string(),
    package: z.string(),
  }),
}).server(async ({ packageName, period = 'last-month' }) => {
  const url = `${NPM_API_BASE}/downloads/point/${period}/${encodeURIComponent(packageName)}`
  const response = await fetchWithTimeout(url)

  if (!response.ok) {
    throw new Error(`NPM API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  return {
    downloads: data.downloads,
    start: data.start,
    end: data.end,
    package: data.package,
  }
})

// 2. Get daily download data over a date range
export const getNpmDownloadRangeTool = toolDefinition({
  name: 'getNpmDownloadRange',
  description:
    'Get daily NPM download data for a date range. Returns an array of day-by-day download counts.',
  inputSchema: z.object({
    packageName: z.string().describe('Package name'),
    startDate: z.string().describe('Start date (YYYY-MM-DD)'),
    endDate: z.string().describe('End date (YYYY-MM-DD)'),
  }),
  outputSchema: z.object({
    downloads: z.array(
      z.object({
        day: z.string(),
        downloads: z.number(),
      }),
    ),
    start: z.string(),
    end: z.string(),
    package: z.string(),
  }),
}).server(async ({ packageName, startDate, endDate }) => {
  const url = `${NPM_API_BASE}/downloads/range/${startDate}:${endDate}/${encodeURIComponent(packageName)}`
  const response = await fetchWithTimeout(url)

  if (!response.ok) {
    throw new Error(`NPM API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()
  return {
    downloads: data.downloads,
    start: data.start,
    end: data.end,
    package: data.package,
  }
})

// 3. Get NPM package metadata
export const getNpmPackageInfoTool = toolDefinition({
  name: 'getNpmPackageInfo',
  description:
    'Get NPM package metadata including description, version history, maintainers, and keywords.',
  inputSchema: z.object({
    packageName: z.string().describe('Package name'),
  }),
  outputSchema: z.object({
    name: z.string(),
    description: z.string().nullable(),
    version: z.string(),
    versions: z.array(z.string()),
    maintainers: z.array(
      z.object({
        name: z.string(),
        email: z.string().optional(),
      }),
    ),
    repository: z
      .object({
        url: z.string(),
      })
      .nullable(),
    keywords: z.array(z.string()),
    time: z.record(z.string(), z.string()),
  }),
}).server(async ({ packageName }) => {
  const url = `${NPM_REGISTRY}/${encodeURIComponent(packageName)}`
  const response = await fetchWithTimeout(url)

  if (!response.ok) {
    throw new Error(`NPM API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()

  // Get version list (limit to last 50 for performance)
  const versionList = Object.keys(data.versions || {}).slice(-50)

  return {
    name: data.name,
    description: data.description || null,
    version: data['dist-tags']?.latest || versionList[versionList.length - 1],
    versions: versionList,
    maintainers: (data.maintainers || []).map(
      (m: { name: string; email?: string }) => ({
        name: m.name,
        email: m.email,
      }),
    ),
    repository: data.repository ? { url: data.repository.url } : null,
    keywords: data.keywords || [],
    time: data.time || {},
  }
})

// 4. Compare download counts for multiple packages
export const compareNpmPackagesTool = toolDefinition({
  name: 'compareNpmPackages',
  description:
    'Compare download counts for multiple NPM packages over a period.',
  inputSchema: z.object({
    packages: z.array(z.string()).describe('Array of package names to compare'),
    period: z
      .enum(['last-week', 'last-month', 'last-year'])
      .default('last-month')
      .describe('Time period'),
  }),
  outputSchema: z.array(
    z.object({
      package: z.string(),
      downloads: z.number(),
    }),
  ),
}).server(async ({ packages, period = 'last-month' }) => {
  const results = await Promise.all(
    packages.map(async (pkg) => {
      try {
        const url = `${NPM_API_BASE}/downloads/point/${period}/${encodeURIComponent(pkg)}`
        const response = await fetchWithTimeout(url)

        if (!response.ok) {
          return { package: pkg, downloads: 0 }
        }

        const data = await response.json()
        return { package: pkg, downloads: data.downloads }
      } catch (_error) {
        return { package: pkg, downloads: 0 }
      }
    }),
  )

  return results.sort((a, b) => b.downloads - a.downloads)
})

// Export all NPM tools as a collection
export const npmTools = [
  getNpmDownloadsTool,
  getNpmDownloadRangeTool,
  getNpmPackageInfoTool,
  compareNpmPackagesTool,
]














