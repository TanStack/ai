import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import type { ToolExecutionContext } from '@tanstack/ai'

const NPM_API_BASE = 'https://api.npmjs.org'
const NPM_REGISTRY = 'https://registry.npmjs.org'
const FETCH_TIMEOUT = 15000 // 15 second timeout per request

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

// 1. Get NPM package metadata
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
}).server(async ({ packageName }, context?: ToolExecutionContext) => {
  const url = `${NPM_REGISTRY}/${encodeURIComponent(packageName)}`
  const response = await fetchWithTimeout(url)

  if (!response.ok) {
    throw new Error(`NPM API error: ${response.status} ${response.statusText}`)
  }

  const data = await response.json()

  // Get version list (limit to last 50 for performance)
  const versionList = Object.keys(data.versions || {}).slice(-50)

  const result = {
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

  // Emit JSON data via custom event for sidebar display
  const emitCustomEvent = context?.emitCustomEvent || (() => {})
  emitCustomEvent('npm:data', {
    componentType: 'packageInfo',
    toolName: 'getNpmPackageInfo',
    data: result,
  })

  return result
})

const comparisonPeriodSchema = z.enum(['last-week', 'last-month', 'last-year'])

type NpmComparison = {
  period: z.infer<typeof comparisonPeriodSchema>
  packages: Array<string>
}

const npmComparisonStore = new Map<string, NpmComparison>()

const generateComparisonId = () => {
  const cryptoApi = globalThis.crypto
  if (typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

// 2. Create an NPM comparison session
export const createNpmComparisonTool = toolDefinition({
  name: 'createNPMComparison',
  description:
    'Create a comparison session and get the first comparison ID. You must call addToNPMComparison one package at a time, passing the latest ID returned each time. When you have added all packages, call executeNPMComparison with the final ID.',
  inputSchema: z.object({
    period: comparisonPeriodSchema
      .default('last-month')
      .describe('Time period for the comparison.'),
  }),
  outputSchema: z.object({
    id: z
      .string()
      .describe(
        'Comparison ID. Pass this ID into addToNPMComparison to add packages.',
      ),
  }),
}).server(async ({ period = 'last-month' }) => {
  const id = generateComparisonId()
  npmComparisonStore.set(id, { period, packages: [] })
  await Promise.resolve()

  return { id }
})

// 3. Add a package to a comparison session
export const addToNpmComparisonTool = toolDefinition({
  name: 'addToNPMComparison',
  description:
    'Add exactly one package to an existing comparison session. This returns a NEW comparison ID that must be used for the next addToNPMComparison call or for executeNPMComparison. The previous ID becomes stale for subsequent steps.',
  inputSchema: z.object({
    id: z.string().describe('Latest comparison ID returned by the last step.'),
    package: z.string().describe('Package name to add.'),
  }),
  outputSchema: z.object({
    id: z
      .string()
      .describe('New comparison ID to use for the next step in the chain.'),
  }),
}).server(async ({ id, package: packageName }) => {
  const comparison = npmComparisonStore.get(id)

  if (!comparison) {
    throw new Error(
      'Unknown comparison ID. Call createNPMComparison to start a new comparison.',
    )
  }

  const nextId = generateComparisonId()
  npmComparisonStore.set(nextId, {
    period: comparison.period,
    packages: [...comparison.packages, packageName],
  })
  await Promise.resolve()

  return { id: nextId }
})

// 4. Execute the comparison using the final ID
export const executeNpmComparisonTool = toolDefinition({
  name: 'executeNPMComparison',
  description:
    'Execute a comparison using the final comparison ID returned by addToNPMComparison. This only works after you have added all packages; it will compare download counts for the stored package list.',
  inputSchema: z.object({
    id: z
      .string()
      .describe(
        'Final comparison ID returned after your last addToNPMComparison call.',
      ),
  }),
  outputSchema: z.array(
    z.object({
      package: z.string(),
      downloads: z.number(),
    }),
  ),
}).server(async ({ id }, context?: ToolExecutionContext) => {
  const comparison = npmComparisonStore.get(id)

  if (!comparison) {
    throw new Error(
      'Unknown comparison ID. Call createNPMComparison to start a new comparison.',
    )
  }

  if (comparison.packages.length === 0) {
    throw new Error(
      'No packages were added. Call addToNPMComparison at least once before executing.',
    )
  }

  const results = await Promise.all(
    comparison.packages.map(async (pkg) => {
      try {
        const url = `${NPM_API_BASE}/downloads/point/${comparison.period}/${encodeURIComponent(pkg)}`
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

  const sortedResults = results.sort((a, b) => b.downloads - a.downloads)

  // Emit JSON data via custom event for sidebar display
  const emitCustomEvent = context?.emitCustomEvent || (() => {})
  emitCustomEvent('npm:data', {
    componentType: 'compare',
    toolName: 'executeNPMComparison',
    data: { packages: sortedResults, period: comparison.period },
  })

  return sortedResults
})

// Export all NPM tools as a collection
export const npmTools = [
  getNpmPackageInfoTool,
  createNpmComparisonTool,
  addToNpmComparisonTool,
  executeNpmComparisonTool,
]
