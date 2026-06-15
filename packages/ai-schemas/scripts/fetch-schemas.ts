#!/usr/bin/env tsx
/**
 * Fetch upstream OpenAPI specs for every provider and cache them under
 * scripts/specs/{providerId}/. Subsequent steps (`generate-schemas`,
 * `generate-endpoint-maps`) consume those cached specs.
 *
 * Usage:
 *   pnpm fetch-schemas                       # fetch every provider
 *   pnpm fetch-schemas --provider=openai     # one provider
 *   pnpm fetch-schemas --provider=fal,openai # subset
 *
 * Skipping rules:
 *   - Providers with requiresAuth: true and no env var set are logged and
 *     skipped (rather than throwing). This lets the nightly workflow run
 *     end-to-end even before all secrets are configured.
 *   - Network failures for one provider are logged and skipped; the script
 *     exits 0 unless every requested provider failed.
 */

import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { ALL_PROVIDERS } from './providers/index.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SPECS_ROOT = join(__dirname, 'specs')

interface CliArgs {
  providers: Array<string> | null
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2)
  let providers: Array<string> | null = null

  for (const arg of args) {
    if (arg.startsWith('--provider=') || arg.startsWith('--providers=')) {
      const list = arg.split('=')[1]
      if (!list) throw new Error('Provider list is empty')
      providers = list
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    } else {
      throw new Error(`Unknown argument: ${arg}`)
    }
  }

  return { providers }
}

async function main(): Promise<void> {
  const args = parseArgs()
  const selected = args.providers
    ? ALL_PROVIDERS.filter((p) => args.providers!.includes(p.id))
    : ALL_PROVIDERS

  if (selected.length === 0) {
    console.error('No matching providers selected.')
    process.exit(1)
  }

  let succeeded = 0
  let skipped = 0
  let failed = 0

  for (const provider of selected) {
    const outDir = join(SPECS_ROOT, provider.id)
    console.log(`\n=== ${provider.id} ===`)

    if (provider.requiresAuth && provider.authEnvVar) {
      if (!process.env[provider.authEnvVar]) {
        console.log(
          `  Skipping ${provider.id}: env var ${provider.authEnvVar} is not set.`,
        )
        skipped++
        continue
      }
    }

    try {
      await provider.fetch({ outDir })
      succeeded++
    } catch (error) {
      console.error(
        `  ${provider.id} fetch failed:`,
        error instanceof Error ? error.message : error,
      )
      failed++
    }
  }

  if (succeeded > 0) {
    // Fetchers write plain JSON.stringify output; normalise with the repo's
    // Prettier so the committed specs match what `pnpm format` / the autofix
    // bot would produce — otherwise every sync PR gets a formatting
    // follow-up commit.
    console.log('\nFormatting fetched specs with Prettier...')
    execFileSync('pnpm', ['exec', 'prettier', '--write', SPECS_ROOT], {
      stdio: 'inherit',
    })
  }

  console.log(
    `\nDone. ${succeeded} succeeded, ${skipped} skipped, ${failed} failed.`,
  )
  if (succeeded === 0 && failed > 0) process.exit(1)
}

main().catch((error) => {
  console.error('\nUnhandled error:', error)
  process.exit(1)
})
