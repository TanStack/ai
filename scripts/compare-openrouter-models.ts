/**
 * Compare openrouter.models.ts between the current branch and main.
 * Outputs a markdown summary of added/removed/updated models suitable for a PR description.
 *
 * Usage: npx tsx scripts/compare-openrouter-models.ts [--updated]
 */

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname =
  typeof import.meta.dirname === 'string'
    ? import.meta.dirname
    : dirname(fileURLToPath(import.meta.url))

interface ModelSnapshot {
  id: string
  name: string
  context_length: string
  pricing_prompt: string
  pricing_completion: string
  modality: string
}

/**
 * Extract model snapshots from source using regex.
 * Captures the key fields that reviewers care about for detecting updates.
 */
function extractModels(source: string): Map<string, ModelSnapshot> {
  const models = new Map<string, ModelSnapshot>()

  // Split into model blocks (each starts with `  {` and ends with `  },` or `  }\n]`)
  const blocks = source.split(/\n {2}\{/)

  for (const block of blocks) {
    const id = block.match(/id:\s*'([^']+)'/)?.[1]
    if (!id) continue

    const name = block.match(/name:\s*'([^']+)'/)?.[1] ?? ''
    const context_length = (
      block.match(/^\s*context_length:\s*([^,]+)\s*,?\s*$/m)?.[1] ?? ''
    ).trim()
    const pricing_prompt = block.match(/prompt:\s*'([^']+)'/)?.[1] ?? ''
    const pricing_completion = block.match(/completion:\s*'([^']+)'/)?.[1] ?? ''
    const modality = block.match(/modality:\s*'([^']+)'/)?.[1] ?? ''

    models.set(id, {
      id,
      name,
      context_length,
      pricing_prompt,
      pricing_completion,
      modality,
    })
  }

  return models
}

function describeChanges(
  oldModel: ModelSnapshot,
  newModel: ModelSnapshot,
): Array<string> {
  const changes: Array<string> = []

  if (oldModel.name !== newModel.name) {
    changes.push(`name: "${oldModel.name}" → "${newModel.name}"`)
  }
  if (oldModel.context_length !== newModel.context_length) {
    changes.push(
      `context_length: ${oldModel.context_length} → ${newModel.context_length}`,
    )
  }
  if (oldModel.pricing_prompt !== newModel.pricing_prompt) {
    changes.push(
      `prompt price: ${oldModel.pricing_prompt} → ${newModel.pricing_prompt}`,
    )
  }
  if (oldModel.pricing_completion !== newModel.pricing_completion) {
    changes.push(
      `completion price: ${oldModel.pricing_completion} → ${newModel.pricing_completion}`,
    )
  }
  if (oldModel.modality !== newModel.modality) {
    changes.push(`modality: "${oldModel.modality}" → "${newModel.modality}"`)
  }

  return changes
}

const showUpdated = process.argv.includes('--updated')

const modelsPath = 'scripts/openrouter.models.ts'

// Current branch version
const currentSource = readFileSync(
  resolve(__dirname, '..', modelsPath),
  'utf-8',
)

// Main branch version — hardcoded git command, no user input (safe from injection)
let mainSource: string
try {
  mainSource = execSync(`git show main:${modelsPath}`, {
    encoding: 'utf-8',
    stdio: 'pipe',
  })
} catch {
  console.error('Could not read main branch version. Are you in a git repo?')
  process.exit(1)
}

const currentModels = extractModels(currentSource)
const mainModels = extractModels(mainSource)

const currentIds = [...currentModels.keys()]
const mainIds = [...mainModels.keys()]

const added = currentIds.filter((id) => !mainModels.has(id)).sort()
const removed = mainIds.filter((id) => !currentModels.has(id)).sort()

// Find updated models (present in both, but with changed fields)
const updated: Array<{ id: string; changes: Array<string> }> = []
if (showUpdated) {
  for (const id of currentIds) {
    if (!mainModels.has(id)) continue
    const changes = describeChanges(mainModels.get(id)!, currentModels.get(id)!)
    if (changes.length > 0) {
      updated.push({ id, changes })
    }
  }
  updated.sort((a, b) => a.id.localeCompare(b.id))
}

// Output markdown
const lines: Array<string> = []

lines.push('## OpenRouter Models Update Summary')
lines.push('')
lines.push(
  `**Model count**: ${mainIds.length} (main) → ${currentIds.length} (this branch)`,
)
lines.push('')

if (added.length > 0) {
  lines.push(`### Added models (${added.length})`)
  lines.push('')
  for (const id of added) {
    lines.push(`- \`${id}\``)
  }
  lines.push('')
}

if (removed.length > 0) {
  lines.push(`### Removed models (${removed.length})`)
  lines.push('')
  for (const id of removed) {
    lines.push(`- \`${id}\``)
  }
  lines.push('')
}

if (updated.length > 0) {
  lines.push(`### Updated models (${updated.length})`)
  lines.push('')
  for (const { id, changes } of updated) {
    lines.push(`- \`${id}\`: ${changes.join(', ')}`)
  }
  lines.push('')
}

if (added.length === 0 && removed.length === 0 && updated.length === 0) {
  lines.push('No changes detected.')
  lines.push('')
}

console.log(lines.join('\n'))
