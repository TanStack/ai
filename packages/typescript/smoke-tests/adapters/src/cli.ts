#!/usr/bin/env node

import { config } from 'dotenv'
import { Command } from 'commander'
import { ADAPTERS, getAdapter } from './adapters'
import type { AdapterSet } from './adapters'
import { TESTS, getTest, getDefaultTests } from './tests'
import type { TestDefinition, AdapterCapability } from './tests'
import type { AdapterContext, TestOutcome } from './harness'

// Load .env.local first (higher priority), then .env
config({ path: '.env.local' })
config({ path: '.env' })

interface AdapterResult {
  adapter: string
  model: string
  tests: Record<string, TestOutcome>
}

/**
 * List available adapters and/or tests
 */
function listCommand(options: { adapters?: boolean; tests?: boolean }) {
  const showAll = !options.adapters && !options.tests

  if (showAll || options.adapters) {
    console.log('\n📦 Available Adapters:\n')
    console.log('  ID          Name        Env Key              Status')
    console.log('  ----------  ----------  -------------------  ------')
    for (const adapter of ADAPTERS) {
      const envValue = adapter.envKey ? process.env[adapter.envKey] : null
      const status =
        adapter.envKey === null
          ? '✅ Ready'
          : envValue
            ? '✅ Ready'
            : '⚠️  Missing env'

      console.log(
        `  ${adapter.id.padEnd(10)}  ${adapter.name.padEnd(10)}  ${(adapter.envKey || 'none').padEnd(19)}  ${status}`,
      )
    }
  }

  if (showAll || options.tests) {
    console.log('\n🧪 Available Tests:\n')
    console.log('  ID   Name                  Requires    Description')
    console.log('  ---  --------------------  ----------  -----------')
    for (const test of TESTS) {
      const requires = test.requires.join(', ')
      const skipNote = test.skipByDefault ? ' (skip by default)' : ''
      console.log(
        `  ${test.id}  ${test.name.padEnd(20)}  ${requires.padEnd(10)}  ${test.description}${skipNote}`,
      )
    }
  }

  console.log('')
}

/**
 * Check if adapter has the required capability
 */
function hasCapability(
  adapterSet: AdapterSet,
  capability: AdapterCapability,
): boolean {
  switch (capability) {
    case 'text':
      return !!adapterSet.textAdapter
    case 'summarize':
      return !!adapterSet.summarizeAdapter
    case 'embedding':
      return !!adapterSet.embeddingAdapter
    case 'image':
      return !!adapterSet.imageAdapter
    default:
      return false
  }
}

/**
 * Format the results grid
 */
function formatGrid(results: AdapterResult[], testsRun: TestDefinition[]) {
  const headers = ['Adapter', ...testsRun.map((t) => t.id)]
  const rows = results.map((result) => [
    `${result.adapter} (${result.model})`,
    ...testsRun.map((test) => {
      const outcome = result.tests[test.id]
      if (!outcome) return '—'
      if (outcome.ignored) return '⋯'
      return outcome.passed ? '✅' : '❌'
    }),
  ])

  const colWidths = headers.map((header, index) =>
    Math.max(
      header.length,
      ...rows.map((row) => (row[index] ? row[index].length : 0)),
    ),
  )

  const separator = colWidths.map((w) => '-'.repeat(w)).join('-+-')
  const formatRow = (row: string[]) =>
    row.map((cell, idx) => cell.padEnd(colWidths[idx]!)).join(' | ')

  console.log(formatRow(headers))
  console.log(separator)
  rows.forEach((row) => console.log(formatRow(row)))
}

/**
 * Run tests with optional filtering
 */
async function runCommand(options: { adapters?: string; tests?: string }) {
  // Parse adapter filter
  const adapterFilter = options.adapters
    ? options.adapters.split(',').map((a) => a.trim().toLowerCase())
    : null

  // Parse test filter
  const testFilter = options.tests
    ? options.tests.split(',').map((t) => t.trim().toUpperCase())
    : null

  // Determine which adapters to run
  const adaptersToRun = adapterFilter
    ? ADAPTERS.filter((a) => adapterFilter.includes(a.id.toLowerCase()))
    : ADAPTERS

  // Validate adapter filter
  if (adapterFilter) {
    for (const id of adapterFilter) {
      if (!getAdapter(id)) {
        console.error(`❌ Unknown adapter: "${id}"`)
        console.error(
          `   Valid adapters: ${ADAPTERS.map((a) => a.id).join(', ')}`,
        )
        process.exit(1)
      }
    }
  }

  // Determine which tests to run
  let testsToRun: TestDefinition[]
  if (testFilter) {
    testsToRun = []
    for (const id of testFilter) {
      const test = getTest(id)
      if (!test) {
        console.error(`❌ Unknown test: "${id}"`)
        console.error(`   Valid tests: ${TESTS.map((t) => t.id).join(', ')}`)
        process.exit(1)
      }
      testsToRun.push(test)
    }
  } else {
    // Run default tests (excluding skipByDefault like IMG)
    testsToRun = getDefaultTests()
  }

  console.log('🚀 Starting TanStack AI adapter tests')
  console.log(`   Adapters: ${adaptersToRun.map((a) => a.name).join(', ')}`)
  console.log(`   Tests: ${testsToRun.map((t) => t.id).join(', ')}`)
  console.log('')

  const results: AdapterResult[] = []

  for (const adapterDef of adaptersToRun) {
    // Try to create the adapter set
    const adapterSet = adapterDef.create()

    if (!adapterSet) {
      console.log(
        `⚠️  Skipping ${adapterDef.name}: ${adapterDef.envKey} not set`,
      )
      continue
    }

    console.log(`\n${adapterDef.name} (chat: ${adapterSet.chatModel})`)

    const adapterResult: AdapterResult = {
      adapter: adapterDef.name,
      model: adapterSet.chatModel,
      tests: {},
    }

    // Build adapter context
    const ctx: AdapterContext = {
      adapterName: adapterDef.name,
      textAdapter: adapterSet.textAdapter,
      summarizeAdapter: adapterSet.summarizeAdapter,
      embeddingAdapter: adapterSet.embeddingAdapter,
      imageAdapter: adapterSet.imageAdapter,
      model: adapterSet.chatModel,
      summarizeModel: adapterSet.summarizeModel,
      embeddingModel: adapterSet.embeddingModel,
      imageModel: adapterSet.imageModel,
    }

    // Run each test
    for (const test of testsToRun) {
      // Check if adapter has required capabilities
      const missingCapabilities = test.requires.filter(
        (cap) => !hasCapability(adapterSet, cap),
      )

      if (missingCapabilities.length > 0) {
        console.log(
          `[${adapterDef.name}] ⋯ ${test.id}: Ignored (missing: ${missingCapabilities.join(', ')})`,
        )
        adapterResult.tests[test.id] = { passed: true, ignored: true }
        continue
      }

      // Run the test
      adapterResult.tests[test.id] = await test.run(ctx)
    }

    results.push(adapterResult)
  }

  console.log('\n')

  if (results.length === 0) {
    console.log('⚠️  No tests were run.')
    if (adapterFilter) {
      console.log(
        '   The specified adapters may not be configured or available.',
      )
    }
    process.exit(1)
  }

  // Print results grid
  formatGrid(results, testsToRun)

  // Check for failures
  const allPassed = results.every((result) =>
    testsToRun.every((test) => {
      const outcome = result.tests[test.id]
      // Ignored tests don't count as failures
      return !outcome || outcome.ignored || outcome.passed
    }),
  )

  console.log('\n' + '='.repeat(60))
  if (allPassed) {
    console.log('✅ All tests passed!')
    process.exit(0)
  } else {
    console.log('❌ Some tests failed')
    process.exit(1)
  }
}

// Set up CLI
const program = new Command()
  .name('tanstack-ai-tests')
  .description('TanStack AI adapter smoke tests')
  .version('1.0.0')

program
  .command('list')
  .description('List available adapters and tests')
  .option('--adapters', 'List adapters only')
  .option('--tests', 'List tests only')
  .action(listCommand)

program
  .command('run')
  .description('Run tests')
  .option(
    '--adapters <names>',
    'Comma-separated list of adapters (e.g., openai,gemini)',
  )
  .option(
    '--tests <acronyms>',
    'Comma-separated list of test acronyms (e.g., CST,OST,STR)',
  )
  .action(runCommand)

// Default command is 'run' for backward compatibility
program.action(() => {
  runCommand({})
})

program.parse()
