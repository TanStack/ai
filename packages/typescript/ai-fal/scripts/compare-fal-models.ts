/**
 * Script to compare Fal API models with @fal-ai/client EndpointTypeMap
 *
 * This script identifies models that exist in the Fal API but are missing
 * from the TypeScript SDK, helping track when Fal introduces new models.
 *
 * Usage:
 *   pnpm exec tsx scripts/compare-fal-models.ts
 *   pnpm exec tsx scripts/compare-fal-models.ts --csv
 *   pnpm exec tsx scripts/compare-fal-models.ts --csv=output.csv
 *
 * Note: Run 'pnpm fetch:fal-models' first to download the latest models
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

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

interface ComparisonResults {
  missingFromSDK: Array<FalApiModel> // In API but not in EndpointTypeMap
  deprecatedInAPI: Array<string> // In EndpointTypeMap but not in API
  totalApiModels: number
  totalSDKModels: number
  activeApiModels: number
}

// ============================================================
// Core Functions
// ============================================================

/**
 * Load models from JSON file
 */
function loadFalModels(): Array<FalApiModel> {
  try {
    const modelsPath = join(__dirname, 'fal.models.json')
    const content = readFileSync(modelsPath, 'utf-8')
    const data = JSON.parse(content) as {
      generated_at: string
      total_models: number
      models: Array<FalApiModel>
    }
    return data.models
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('no such file') ||
        error.message.includes('ENOENT'))
    ) {
      throw new Error(
        'Models file not found. Run "pnpm fetch:fal-models" first to download the models.',
      )
    }
    throw error
  }
}

/**
 * Parse EndpointTypeMap from the @fal-ai/client type definitions
 */
function getEndpointTypeMapKeys(): Set<string> {
  try {
    const typesPath = join(
      __dirname,
      '../node_modules/@fal-ai/client/src/types/endpoints.d.ts',
    )

    const content = readFileSync(typesPath, 'utf-8')

    // Find the EndpointTypeMap section
    const endpointMapMatch = content.match(
      /export type EndpointTypeMap = \{([\s\S]*?)\n\};/,
    )

    if (!endpointMapMatch) {
      throw new Error('Could not find EndpointTypeMap in endpoints.d.ts')
    }

    const mapContent = endpointMapMatch[1]
    if (!mapContent) {
      throw new Error('Could not find EndpointTypeMap in endpoints.d.ts')
    }
    // Extract model IDs using regex: "model-id": {
    const modelIdRegex = /"([^"]+)":\s*\{/g
    const modelIds = new Set<string>()

    let match
    while ((match = modelIdRegex.exec(mapContent)) !== null) {
      modelIds.add(match[1]!)
    }

    return modelIds
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Error reading EndpointTypeMap: ${error.message}`)
    }
    throw error
  }
}

/**
 * Compare API models with SDK type definitions
 */
function compareModelSets(
  apiModels: Array<FalApiModel>,
  sdkKeys: Set<string>,
): ComparisonResults {
  const apiModelIds = new Set<string>(apiModels.map((m) => m.endpoint_id))

  // Find models in API but not in SDK
  const missingFromSDK = apiModels.filter(
    (model) => !sdkKeys.has(model.endpoint_id),
  )

  // Find models in SDK but not in API (potentially deprecated)
  const deprecatedInAPI = Array.from(sdkKeys).filter(
    (id) => !apiModelIds.has(id),
  )

  // Calculate statistics
  const activeApiModels = apiModels.filter(
    (m) => m.metadata.status === 'active',
  ).length

  return {
    missingFromSDK,
    deprecatedInAPI,
    totalApiModels: apiModels.length,
    totalSDKModels: sdkKeys.size,
    activeApiModels,
  }
}

/**
 * Print comparison results to console
 */
function printResults(results: ComparisonResults): void {
  console.log('\n' + '='.repeat(80))
  console.log('Fal Model Comparison Results')
  console.log('='.repeat(80) + '\n')

  // Summary Statistics
  console.log('📊 Summary Statistics')
  console.log('-'.repeat(80))
  console.log(`Total API Models:       ${results.totalApiModels}`)
  console.log(`Active API Models:      ${results.activeApiModels}`)
  console.log(`Total SDK Models:       ${results.totalSDKModels}`)
  console.log(`Missing from SDK:       ${results.missingFromSDK.length}`)
  console.log(`Deprecated in API:      ${results.deprecatedInAPI.length}`)
  console.log('')

  // Missing from SDK (grouped by category and status)
  if (results.missingFromSDK.length > 0) {
    console.log('🔍 Models in API but Missing from SDK')
    console.log('-'.repeat(80))

    // Group by category
    const byCategory = results.missingFromSDK.reduce(
      (acc, model) => {
        const category = model.metadata.category || 'uncategorized'
        if (!acc[category]) {
          acc[category] = []
        }
        acc[category].push(model)
        return acc
      },
      {} as Record<string, Array<FalApiModel>>,
    )

    // Print each category
    for (const [category, models] of Object.entries(byCategory)) {
      console.log(`\n📁 ${category.toUpperCase()} (${models.length})`)
      console.log('')

      for (const model of models) {
        const status = model.metadata.status === 'active' ? '✅' : '⚠️'
        console.log(`  ${status} ${model.endpoint_id}`)
        console.log(`     Name: ${model.metadata.display_name}`)
        console.log(`     Status: ${model.metadata.status}`)
        console.log(
          `     Updated: ${new Date(model.metadata.updated_at).toLocaleDateString()}`,
        )
        if (model.metadata.description) {
          console.log(
            `     Description: ${model.metadata.description.slice(0, 80)}${model.metadata.description.length > 80 ? '...' : ''}`,
          )
        }
        console.log(`     URL: https://fal.ai/models/${model.endpoint_id}`)
        console.log('')
      }
    }
  } else {
    console.log('✅ All API models are present in the SDK!')
    console.log('')
  }

  // Deprecated in API
  if (results.deprecatedInAPI.length > 0) {
    console.log('⚠️  Models in SDK but Not in API (Potentially Deprecated)')
    console.log('-'.repeat(80))
    for (const modelId of results.deprecatedInAPI.slice(0, 10)) {
      console.log(`  - ${modelId}`)
    }
    if (results.deprecatedInAPI.length > 10) {
      console.log(`  ... and ${results.deprecatedInAPI.length - 10} more`)
    }
    console.log('')
  }

  console.log('='.repeat(80))
}

/**
 * Escape CSV field value
 */
function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/**
 * Generate CSV content from comparison results
 */
function generateCSV(results: ComparisonResults): string {
  const lines: Array<string> = []

  // CSV Header
  lines.push(
    'Type,Endpoint ID,Display Name,Category,Status,Updated At,Description,URL,Tags',
  )

  // Missing from SDK models
  for (const model of results.missingFromSDK) {
    const row = [
      'MISSING_FROM_SDK',
      escapeCsvField(model.endpoint_id),
      escapeCsvField(model.metadata.display_name),
      escapeCsvField(model.metadata.category || ''),
      escapeCsvField(model.metadata.status),
      escapeCsvField(model.metadata.updated_at),
      escapeCsvField(model.metadata.description || ''),
      escapeCsvField(`https://fal.ai/models/${model.endpoint_id}`),
      escapeCsvField(model.metadata.tags.join('; ') || ''),
    ]
    lines.push(row.join(','))
  }

  // Deprecated in API models
  for (const modelId of results.deprecatedInAPI) {
    const row = [
      'DEPRECATED_IN_API',
      escapeCsvField(modelId),
      '', // No display name
      '', // No category
      '', // No status
      '', // No updated_at
      '', // No description
      '', // No URL
      '', // No tags
    ]
    lines.push(row.join(','))
  }

  return lines.join('\n')
}

/**
 * Write CSV file
 */
function writeCsvFile(
  results: ComparisonResults,
  filename: string = 'fal-models-comparison.csv',
): void {
  const csv = generateCSV(results)
  const outputPath = join(process.cwd(), filename)

  writeFileSync(outputPath, csv, 'utf-8')
  console.log(`\n✅ CSV exported to: ${outputPath}`)
  console.log(
    `   Total rows: ${results.missingFromSDK.length + results.deprecatedInAPI.length + 1}`,
  )
  console.log(`   - Missing from SDK: ${results.missingFromSDK.length}`)
  console.log(`   - Deprecated in API: ${results.deprecatedInAPI.length}\n`)
}

/**
 * Parse command-line arguments
 */
function parseArgs(): { csv: boolean; csvFilename: string } {
  const args = process.argv.slice(2)
  let csv = false
  let csvFilename = 'fal-models-comparison.csv'

  for (const arg of args) {
    if (arg === '--csv') {
      csv = true
    } else if (arg.startsWith('--csv=')) {
      csv = true
      const csvFilenameArg = arg.split('=')[1]
      if (!csvFilenameArg) {
        throw new Error('csv filename not specified')
      }
      csvFilename = csvFilenameArg
    }
  }

  return { csv, csvFilename }
}

// ============================================================
// Main Execution
// ============================================================

async function main() {
  try {
    const { csv, csvFilename } = parseArgs()

    console.log('Loading Fal models...')
    const apiModels = await loadFalModels()
    console.log(`Loaded ${apiModels.length} models`)

    console.log('Reading EndpointTypeMap from SDK...')
    const sdkKeys = getEndpointTypeMapKeys()

    console.log('Comparing model sets...')
    const results = compareModelSets(apiModels, sdkKeys)

    if (csv) {
      writeCsvFile(results, csvFilename)
    } else {
      printResults(results)
    }
  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

main()
