#!/usr/bin/env tsx
/**
 * Distribute API keys from a source file to all .env and .env.local files in the project.
 *
 * Usage: pnpm tsx scripts/distribute-keys.ts <source-file>
 *
 * Example: pnpm tsx scripts/distribute-keys.ts ~/keys.env
 *
 * The source file should contain KEY=value pairs, one per line.
 * Keys from the source file will be added/updated in all target env files.
 * Existing keys not in the source file will be preserved.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'

// Static paths for .env.local files
const STATIC_ENV_LOCAL_PATHS = [
  'testing/panel/.env.local',
  'packages/typescript/smoke-tests/e2e/.env.local',
  'packages/typescript/smoke-tests/adapters/.env.local',
  'packages/typescript/ai-code-mode/.env.local',
  'packages/typescript/ai-anthropic/live-tests/.env.local',
  'packages/typescript/ai-openai/live-tests/.env.local',
]

/**
 * Dynamically find all .env and .env.local files in the examples directory
 */
function findExampleEnvFiles(projectRoot: string): string[] {
  const examplesDir = path.join(projectRoot, 'examples')
  if (!fs.existsSync(examplesDir)) return []

  const envFiles: string[] = []
  const examples = fs.readdirSync(examplesDir, { withFileTypes: true })

  for (const entry of examples) {
    if (!entry.isDirectory()) continue

    const exampleDir = path.join(examplesDir, entry.name)

    // Check for .env.local
    const envLocalPath = path.join(exampleDir, '.env.local')
    if (fs.existsSync(envLocalPath)) {
      envFiles.push(`examples/${entry.name}/.env.local`)
    }

    // Check for .env
    const envPath = path.join(exampleDir, '.env')
    if (fs.existsSync(envPath)) {
      envFiles.push(`examples/${entry.name}/.env`)
    }
  }

  return envFiles
}

function parseEnvFile(content: string): Map<string, string> {
  const entries = new Map<string, string>()
  const lines = content.split('\n')

  for (const line of lines) {
    const trimmed = line.trim()
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue

    const eqIndex = trimmed.indexOf('=')
    if (eqIndex > 0) {
      const key = trimmed.slice(0, eqIndex).trim()
      const value = trimmed.slice(eqIndex + 1).trim()
      entries.set(key, value)
    }
  }

  return entries
}

function serializeEnvFile(entries: Map<string, string>): string {
  const lines: string[] = []
  for (const [key, value] of entries) {
    lines.push(`${key}=${value}`)
  }
  return lines.join('\n') + '\n'
}

function main() {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    console.error('Usage: pnpm tsx scripts/distribute-keys.ts <source-file>')
    console.error('')
    console.error('Example: pnpm tsx scripts/distribute-keys.ts ~/keys.env')
    process.exit(1)
  }

  const sourceFile = args[0]!
  const resolvedSource = path.resolve(sourceFile)

  if (!fs.existsSync(resolvedSource)) {
    console.error(`Error: Source file not found: ${resolvedSource}`)
    process.exit(1)
  }

  // Read source keys
  const sourceContent = fs.readFileSync(resolvedSource, 'utf-8')
  const sourceKeys = parseEnvFile(sourceContent)

  if (sourceKeys.size === 0) {
    console.error('Error: No keys found in source file')
    process.exit(1)
  }

  const projectRoot = path.resolve(import.meta.dirname, '..')

  // Combine static paths with dynamically found example env files
  const exampleEnvFiles = findExampleEnvFiles(projectRoot)
  const allEnvPaths = [...STATIC_ENV_LOCAL_PATHS, ...exampleEnvFiles]

  console.log(`📦 Distributing ${sourceKeys.size} key(s) from ${sourceFile}`)
  console.log(`   Keys: ${Array.from(sourceKeys.keys()).join(', ')}`)
  console.log(`   Target files: ${allEnvPaths.length}`)
  console.log('')

  let updated = 0
  let created = 0
  let skipped = 0

  for (const relativePath of allEnvPaths) {
    const fullPath = path.join(projectRoot, relativePath)
    const dirPath = path.dirname(fullPath)

    // Skip if directory doesn't exist
    if (!fs.existsSync(dirPath)) {
      console.log(`⏭️  Skipped (dir not found): ${relativePath}`)
      skipped++
      continue
    }

    // Read existing file or start fresh
    let existingKeys = new Map<string, string>()
    const fileExists = fs.existsSync(fullPath)

    if (fileExists) {
      const existingContent = fs.readFileSync(fullPath, 'utf-8')
      existingKeys = parseEnvFile(existingContent)
    }

    // Merge: source keys override existing keys
    const mergedKeys = new Map(existingKeys)
    for (const [key, value] of sourceKeys) {
      mergedKeys.set(key, value)
    }

    // Write the merged content
    const newContent = serializeEnvFile(mergedKeys)
    fs.writeFileSync(fullPath, newContent)

    if (fileExists) {
      console.log(`✅ Updated: ${relativePath}`)
      updated++
    } else {
      console.log(`🆕 Created: ${relativePath}`)
      created++
    }
  }

  console.log('')
  console.log(
    `Done! Updated: ${updated}, Created: ${created}, Skipped: ${skipped}`,
  )
}

main()
