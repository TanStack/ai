/**
 * Script to fetch all models from Fal API and save as JSON files per category
 *
 * This script downloads models from the Fal API and saves them to separate
 * JSON files, one per category, for use by other scripts. Supports filtering
 * by category to reduce file size and improve targeted workflows.
 *
 * Usage:
 *   # Fetch all models (default) - saves all categories
 *   pnpm exec tsx scripts/fetch-fal-models.ts
 *
 *   # Fetch specific categories (server-side filtering)
 *   pnpm exec tsx scripts/fetch-fal-models.ts --categories=image-to-image,text-to-video
 *
 *   # Fetch single category
 *   pnpm exec tsx scripts/fetch-fal-models.ts --category=image-to-image
 *
 * Environment Variables:
 *   FAL_KEY - Required API key for Fal API authentication
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// ============================================================
// Type Definitions
// ============================================================

interface FalApiModel {
  endpoint_id: string
  metadata: {
    display_name: string
    category: string
    description: string
    status: 'active' | 'inactive' | 'deprecated'
    tags: Array<string>
    updated_at: string
    [key: string]: any
  }
}

interface FalApiResponse {
  models: Array<FalApiModel>
  has_more: boolean
  next_cursor: string | null
}

interface FilterOptions {
  categories: Array<string> | null // null = no filtering
}

interface ParsedArgs {
  categories: Array<string> | null
}

// ============================================================
// Core Functions
// ============================================================

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Parse command-line arguments
 */
function parseCliArguments(): ParsedArgs {
  const args = process.argv.slice(2)
  let categories: Array<string> | null = null

  for (const arg of args) {
    if (arg.startsWith('--categories=')) {
      const categoriesArg = arg.split('=')[1]
      if (!categoriesArg) {
        throw new Error('Categories not specified')
      }
      categories = categoriesArg
        .split(',')
        .map((c) => c.trim())
        .filter((c) => c.length > 0)
    } else if (arg.startsWith('--category=')) {
      const categoryArg = arg.split('=')[1]
      if (!categoryArg) {
        throw new Error('Category not specified')
      }
      categories = [categoryArg.trim()]
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return { categories }
}

/**
 * Extract unique categories from models with counts
 */
function extractCategories(models: Array<FalApiModel>): Map<string, number> {
  const categoryMap = new Map<string, number>()

  for (const model of models) {
    const category = model.metadata.category || 'uncategorized'
    categoryMap.set(category, (categoryMap.get(category) || 0) + 1)
  }

  return categoryMap
}

/**
 * Sanitize category name for filesystem-safe filename
 */
function sanitizeCategoryName(category: string): string {
  // Replace any characters that aren't alphanumeric, dash, or underscore
  return category.replace(/[^a-zA-Z0-9_-]/g, '-')
}

/**
 * Group models by category
 */
function groupModelsByCategory(
  models: Array<FalApiModel>,
): Map<string, Array<FalApiModel>> {
  const categoryMap = new Map<string, Array<FalApiModel>>()

  for (const model of models) {
    const category = model.metadata.category || 'uncategorized'
    if (!categoryMap.has(category)) {
      categoryMap.set(category, [])
    }
    categoryMap.get(category)!.push(model)
  }

  return categoryMap
}

/**
 * Fetch a single page with retry logic
 */
async function fetchPageWithRetry(
  url: string,
  apiKey: string,
  retries: number = 3,
): Promise<FalApiResponse> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Key ${apiKey}`,
        },
      })

      if (response.status === 429) {
        // Rate limited - wait and retry with exponential backoff
        const waitTime = Math.min(2000 * Math.pow(2, attempt), 10000)
        console.log(`  Rate limited. Waiting ${waitTime}ms before retry...`)
        await sleep(waitTime)
        continue
      }

      if (!response.ok) {
        throw new Error(
          `Failed to fetch Fal models: ${response.status} ${response.statusText}`,
        )
      }

      return (await response.json()) as FalApiResponse
    } catch (error) {
      if (attempt === retries) {
        throw error
      }
      console.log(`  Attempt ${attempt} failed, retrying...`)
      await sleep(1000 * attempt)
    }
  }

  throw new Error('Max retries exceeded')
}

/**
 * Fetch models from the Fal API with pagination and optional category filter
 */
async function fetchFalModels(category?: string): Promise<Array<FalApiModel>> {
  // Validate API key exists
  const apiKey = process.env.FAL_KEY
  if (!apiKey) {
    throw new Error('FAL_KEY environment variable is required')
  }

  const allModels: Array<FalApiModel> = []
  let cursor: string | null = null
  let pageNumber = 1

  const categoryLabel = category ? ` (category: ${category})` : ''
  console.log(`Fetching models from Fal API${categoryLabel}...`)

  do {
    // Build URL with category filter if specified
    const params = new URLSearchParams({
      status: 'active',
      expand: 'openapi-3.0',
    })

    if (category) {
      params.set('category', category)
    }

    if (cursor) {
      params.set('cursor', cursor)
    }

    const url = `https://api.fal.ai/v1/models?${params.toString()}`

    console.log(`  Fetching page ${pageNumber}...`)

    const data = await fetchPageWithRetry(url, apiKey)
    allModels.push(...data.models)

    console.log(
      `  Retrieved ${data.models.length} models (total: ${allModels.length})`,
    )

    cursor = data.has_more ? data.next_cursor : null
    pageNumber++
  } while (cursor)

  return allModels
}

/**
 * Fetch models for multiple categories in parallel
 */
async function fetchModelsByCategories(
  categories: Array<string>,
): Promise<Array<FalApiModel>> {
  console.log(`\nFetching ${categories.length} categories in parallel...\n`)

  // Fetch each category in parallel
  const results = await Promise.all(
    categories.map((category) => fetchFalModels(category)),
  )

  // Combine all results
  const allModels = results.flat()

  // Deduplicate models by endpoint_id (in case a model appears in multiple categories)
  const uniqueModels = Array.from(
    new Map(allModels.map((model) => [model.endpoint_id, model])).values(),
  )

  console.log(
    `\nCombined ${uniqueModels.length} unique models from ${categories.length} categories`,
  )

  return uniqueModels
}

/**
 * Generate JSON file content with metadata for a category
 */
function generateCategoryJsonFile(
  category: string,
  models: Array<FalApiModel>,
  filterOptions: FilterOptions | null,
): string {
  const data: any = {
    generated_at: new Date().toISOString(),
    total_models: models.length,
    category: category,
  }

  // Add filter metadata if filtering was applied
  if (filterOptions?.categories && filterOptions.categories.length > 0) {
    data.filter = {
      categories: filterOptions.categories,
      filtered_at: new Date().toISOString(),
    }
  }

  data.models = models

  return JSON.stringify(data, null, 2)
}

/**
 * Save models grouped by category to separate JSON files
 */
function saveModelsByCategory(
  models: Array<FalApiModel>,
  filterOptions: FilterOptions | null,
): void {
  console.log('\nGrouping models by category...')

  // Group models by category
  const categoryMap = groupModelsByCategory(models)

  console.log(`Found ${categoryMap.size} categories:`)
  for (const [category, categoryModels] of categoryMap.entries()) {
    console.log(`  - ${category}: ${categoryModels.length} models`)
  }

  console.log('\nSaving category files...')

  // Compute script directory (works for both ESM and CommonJS)
  const scriptDir = dirname(fileURLToPath(import.meta.url))
  const scriptsDir = join(scriptDir, 'scripts')

  // Ensure the target directory exists
  mkdirSync(scriptsDir, { recursive: true })

  let savedCount = 0

  // Save each category to its own file
  for (const [category, categoryModels] of categoryMap.entries()) {
    const sanitizedCategory = sanitizeCategoryName(category)
    const filename = `fal.models.${sanitizedCategory}.json`
    const outputPath = join(scriptsDir, filename)

    console.log(
      `  Saving category "${category}" (${categoryModels.length} models) to ${filename}...`,
    )

    const content = generateCategoryJsonFile(
      category,
      categoryModels,
      filterOptions,
    )
    writeFileSync(outputPath, content, 'utf-8')

    savedCount++
  }

  console.log(`\n✅ Successfully saved ${savedCount} category files`)
  console.log(`✅ Total models saved: ${models.length}`)
}

// ============================================================
// Main Execution
// ============================================================

async function main() {
  try {
    // Parse CLI arguments
    const args = parseCliArguments()

    // Fetch models based on arguments
    let models: Array<FalApiModel>

    if (args.categories && args.categories.length > 0) {
      // Use server-side filtering for categories
      models = await fetchModelsByCategories(args.categories)

      // Show category breakdown
      const categoryCounts = extractCategories(models)
      console.log('\nFetched categories:')
      for (const cat of args.categories) {
        const count = categoryCounts.get(cat)
        if (count) {
          console.log(`  ✓ ${cat} (${count} models)`)
        } else {
          console.log(`  ⚠️  ${cat} (0 models)`)
        }
      }
    } else {
      // No filter - fetch all models
      models = await fetchFalModels()
    }

    // Prepare filter options for metadata
    const filterOptions: FilterOptions = {
      categories: args.categories,
    }

    // Save results grouped by category
    saveModelsByCategory(models, filterOptions)
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

main()
