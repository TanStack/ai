/**
 * Script to fetch all models from Fal API and save as JSON file
 *
 * This script downloads all models from the Fal API and saves them to a
 * generated JSON file for use by other scripts.
 *
 * Usage:
 *   pnpm exec tsx scripts/fetch-fal-models.ts
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

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
 * Fetch all models from the Fal API with pagination
 */
async function fetchAllFalModels(): Promise<Array<FalApiModel>> {
  // Validate API key exists
  const apiKey = process.env.FAL_KEY
  if (!apiKey) {
    throw new Error('FAL_KEY environment variable is required')
  }

  const allModels: Array<FalApiModel> = []
  let cursor: string | null = null
  let pageNumber = 1

  console.log('Fetching models from Fal API...')

  do {
    const url = cursor
      ? `https://api.fal.ai/v1/models?cursor=${cursor}&expand=openapi-3.0`
      : 'https://api.fal.ai/v1/models?expand=openapi-3.0'

    console.log(`  Fetching page ${pageNumber}...`)

    const data = await fetchPageWithRetry(url, apiKey)
    allModels.push(...data.models)

    console.log(
      `  Retrieved ${data.models.length} models (total: ${allModels.length})`,
    )

    cursor = data.has_more ? data.next_cursor : null
    pageNumber++

    // Add delay to avoid rate limiting (2 seconds between requests)
    if (cursor) {
      await sleep(2000)
    }
  } while (cursor)

  return allModels
}

/**
 * Generate JSON file content with metadata
 */
function generateJsonFile(models: Array<FalApiModel>): string {
  const data = {
    generated_at: new Date().toISOString(),
    total_models: models.length,
    models: models,
  }

  return JSON.stringify(data, null, 2)
}

/**
 * Save models to JSON file
 */
function saveModelsToFile(models: Array<FalApiModel>): void {
  const outputPath = join(process.cwd(), 'scripts/fal.models.json')

  console.log('\nGenerating JSON file...')

  const content = generateJsonFile(models)

  writeFileSync(outputPath, content, 'utf-8')
  console.log(`✅ Saved to: ${outputPath}`)
  console.log(`\n✅ Successfully saved ${models.length} models`)
}

// ============================================================
// Main Execution
// ============================================================

async function main() {
  try {
    const models = await fetchAllFalModels()
    await saveModelsToFile(models)
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

main()
