#!/usr/bin/env node

import { config } from 'dotenv'
import { Command } from 'commander'
import { ADAPTERS, getAdapter } from './adapters'
import { TESTS, getDefaultTests, getTest } from './tests'
import type { AdapterDefinition, AdapterSet } from './adapters'
import type { AdapterCapability, TestDefinition } from './tests'
import type { AdapterContext, TestOutcome } from './harness'

// Load .env.local first (higher priority), then .env
config({ path: '.env.local' })
config({ path: '.env' })

interface AdapterResult {
  adapter: string
  tests: Record<string, TestOutcome>
}

interface TestTask {
  adapterDef: AdapterDefinition
  adapterSet: AdapterSet
  test: TestDefinition
  ctx: AdapterContext
}

/**
 * Get the display width of a string, accounting for emojis
 */
function displayWidth(str: string): number {
  // Emojis and some special characters take 2 columns
  // This regex matches most common emojis
  const emojiRegex =
    /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|✅|❌|⚠️/gu
  const emojiCount = (str.match(emojiRegex) || []).length
  // Each emoji takes ~2 display columns but counts as 1-2 in length
  // We need to add extra padding for emojis
  return str.length + emojiCount
}

/**
 * Pad a string to a display width, accounting for emojis
 */
function padEnd(str: string, width: number): string {
  const currentWidth = displayWidth(str)
  const padding = Math.max(0, width - currentWidth)
  return str + ' '.repeat(padding)
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
    case 'image':
      return !!adapterSet.imageAdapter
    case 'tts':
      return !!adapterSet.ttsAdapter
    case 'transcription':
      return !!adapterSet.transcriptionAdapter
    default:
      return false
  }
}

/**
 * Format the results grid with proper emoji alignment
 */
function formatGrid(
  results: Array<AdapterResult>,
  testsRun: Array<TestDefinition>,
) {
  const headers = ['Adapter', ...testsRun.map((t) => t.id)]

  // Build rows with result indicators
  const rows = results.map((result) => [
    result.adapter,
    ...testsRun.map((test) => {
      const outcome = result.tests[test.id]
      if (!outcome) return '—'
      if (outcome.ignored) return '—'
      return outcome.passed ? '✅' : '❌'
    }),
  ])

  // Calculate column widths based on display width
  const colWidths = headers.map((header, index) => {
    const headerWidth = displayWidth(header)
    const maxCellWidth = Math.max(
      ...rows.map((row) => displayWidth(row[index] || '')),
    )
    return Math.max(headerWidth, maxCellWidth)
  })

  const separator = colWidths.map((w) => '-'.repeat(w)).join('-+-')
  const formatRow = (row: Array<string>) =>
    row.map((cell, idx) => padEnd(cell, colWidths[idx]!)).join(' | ')

  console.log(formatRow(headers))
  console.log(separator)
  rows.forEach((row) => console.log(formatRow(row)))
}

/**
 * Clear the current line and move cursor to beginning
 */
function clearLine() {
  process.stdout.write('\r\x1b[K')
}

/**
 * Update progress display
 */
function updateProgress(
  completed: number,
  total: number,
  running: Array<string>,
  failed: number,
) {
  clearLine()
  const runningStr =
    running.length > 0 ? ` | Running: ${running.join(', ')}` : ''
  const failedStr = failed > 0 ? ` | ❌ ${failed} failed` : ''
  process.stdout.write(
    `⏳ Progress: ${completed}/${total} completed${failedStr}${runningStr}`,
  )
}

/**
 * Run tests sequentially (original behavior)
 */
async function runSequential(
  adaptersToRun: Array<AdapterDefinition>,
  testsToRun: Array<TestDefinition>,
): Promise<Array<AdapterResult>> {
  const results: Array<AdapterResult> = []

  for (const adapterDef of adaptersToRun) {
    const adapterSet = adapterDef.create()

    if (!adapterSet) {
      console.log(
        `⚠️  Skipping ${adapterDef.name}: ${adapterDef.envKey} not set`,
      )
      continue
    }

    console.log(`\n${adapterDef.name}`)

    const adapterResult: AdapterResult = {
      adapter: adapterDef.name,
      tests: {},
    }

    const ctx: AdapterContext = {
      adapterName: adapterDef.name,
      textAdapter: adapterSet.textAdapter,
      summarizeAdapter: adapterSet.summarizeAdapter,
      imageAdapter: adapterSet.imageAdapter,
      ttsAdapter: adapterSet.ttsAdapter,
      transcriptionAdapter: adapterSet.transcriptionAdapter,
      model: adapterSet.chatModel,
      summarizeModel: adapterSet.summarizeModel,
      imageModel: adapterSet.imageModel,
      ttsModel: adapterSet.ttsModel,
      transcriptionModel: adapterSet.transcriptionModel,
    }

    for (const test of testsToRun) {
      const missingCapabilities = test.requires.filter(
        (cap) => !hasCapability(adapterSet, cap),
      )

      if (missingCapabilities.length > 0) {
        console.log(
          `[${adapterDef.name}] — ${test.id}: Ignored (missing: ${missingCapabilities.join(', ')})`,
        )
        adapterResult.tests[test.id] = { passed: true, ignored: true }
        continue
      }

      adapterResult.tests[test.id] = await test.run(ctx)
    }

    results.push(adapterResult)
  }

  return results
}

/**
 * Run tests in parallel with progress display
 */
async function runParallel(
  adaptersToRun: Array<AdapterDefinition>,
  testsToRun: Array<TestDefinition>,
  concurrency: number,
): Promise<Array<AdapterResult>> {
  // Build task queue
  const tasks: Array<TestTask> = []
  const resultsMap = new Map<string, AdapterResult>()
  const skippedAdapters: Array<string> = []

  for (const adapterDef of adaptersToRun) {
    const adapterSet = adapterDef.create()

    if (!adapterSet) {
      skippedAdapters.push(`${adapterDef.name} (${adapterDef.envKey} not set)`)
      continue
    }

    // Initialize result for this adapter
    const adapterResult: AdapterResult = {
      adapter: adapterDef.name,
      tests: {},
    }
    resultsMap.set(adapterDef.id, adapterResult)

    const ctx: AdapterContext = {
      adapterName: adapterDef.name,
      textAdapter: adapterSet.textAdapter,
      summarizeAdapter: adapterSet.summarizeAdapter,
      imageAdapter: adapterSet.imageAdapter,
      ttsAdapter: adapterSet.ttsAdapter,
      transcriptionAdapter: adapterSet.transcriptionAdapter,
      model: adapterSet.chatModel,
      summarizeModel: adapterSet.summarizeModel,
      imageModel: adapterSet.imageModel,
      ttsModel: adapterSet.ttsModel,
      transcriptionModel: adapterSet.transcriptionModel,
    }

    for (const test of testsToRun) {
      const missingCapabilities = test.requires.filter(
        (cap) => !hasCapability(adapterSet, cap),
      )

      if (missingCapabilities.length > 0) {
        // Mark as ignored immediately
        adapterResult.tests[test.id] = { passed: true, ignored: true }
        continue
      }

      tasks.push({ adapterDef, adapterSet, test, ctx })
    }
  }

  // Show skipped adapters
  if (skippedAdapters.length > 0) {
    console.log(`⚠️  Skipping: ${skippedAdapters.join(', ')}`)
  }

  const total = tasks.length
  let completed = 0
  let failed = 0
  const running = new Set<string>()
  const failedTests: Array<{ name: string; error: string }> = []

  // Show initial progress
  console.log(
    `\n🔄 Running ${total} tests with ${concurrency} parallel workers\n`,
  )
  updateProgress(completed, total, Array.from(running), failed)

  // Suppress console.log during parallel execution
  const originalLog = console.log
  console.log = () => {}

  // Process tasks with limited concurrency
  const taskQueue = [...tasks]

  async function runTask(task: TestTask): Promise<void> {
    const taskName = `${task.adapterDef.name}/${task.test.id}`
    running.add(taskName)
    updateProgress(completed, total, Array.from(running), failed)

    try {
      const outcome = await task.test.run(task.ctx)
      const adapterResult = resultsMap.get(task.adapterDef.id)!
      adapterResult.tests[task.test.id] = outcome

      if (!outcome.passed && !outcome.ignored) {
        failed++
        failedTests.push({
          name: taskName,
          error: outcome.error || 'Unknown error',
        })
      }
    } catch (error: any) {
      const adapterResult = resultsMap.get(task.adapterDef.id)!
      const errorMsg = error?.message || String(error)
      adapterResult.tests[task.test.id] = { passed: false, error: errorMsg }
      failed++
      failedTests.push({ name: taskName, error: errorMsg })
    }

    running.delete(taskName)
    completed++
    updateProgress(completed, total, Array.from(running), failed)
  }

  // Run with concurrency limit
  const workers: Array<Promise<void>> = []

  async function worker() {
    while (taskQueue.length > 0) {
      const task = taskQueue.shift()
      if (task) {
        await runTask(task)
      }
    }
  }

  // Start workers
  for (let i = 0; i < Math.min(concurrency, tasks.length); i++) {
    workers.push(worker())
  }

  // Wait for all workers to complete
  await Promise.all(workers)

  // Restore console.log
  console.log = originalLog

  // Clear progress line and show completion
  clearLine()
  console.log(`✅ Completed ${total} tests (${failed} failed)\n`)

  // Show failed tests summary
  if (failedTests.length > 0) {
    console.log('Failed tests:')
    for (const ft of failedTests) {
      console.log(`  ❌ ${ft.name}: ${ft.error}`)
    }
    console.log('')
  }

  // Return results in adapter order
  return adaptersToRun
    .filter((a) => resultsMap.has(a.id))
    .map((a) => resultsMap.get(a.id)!)
}

/**
 * Run tests with optional filtering
 */
async function runCommand(options: {
  adapters?: string
  tests?: string
  parallel?: string
}) {
  // Parse adapter filter
  const adapterFilter = options.adapters
    ? options.adapters.split(',').map((a) => a.trim().toLowerCase())
    : null

  // Parse test filter
  const testFilter = options.tests
    ? options.tests.split(',').map((t) => t.trim().toUpperCase())
    : null

  // Parse parallel option (default to 5)
  const parallel = options.parallel ? parseInt(options.parallel, 10) : 5

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
  let testsToRun: Array<TestDefinition>
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
    testsToRun = getDefaultTests()
  }

  console.log('🚀 Starting TanStack AI adapter tests')
  console.log(`   Adapters: ${adaptersToRun.map((a) => a.name).join(', ')}`)
  console.log(`   Tests: ${testsToRun.map((t) => t.id).join(', ')}`)
  console.log(`   Parallel: ${parallel}`)

  // Run tests
  let results: Array<AdapterResult>
  if (parallel > 1) {
    results = await runParallel(adaptersToRun, testsToRun, parallel)
  } else {
    results = await runSequential(adaptersToRun, testsToRun)
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
  .option(
    '--parallel <n>',
    'Number of tests to run in parallel (default: 5, use 1 for sequential)',
    '5',
  )
  .action(runCommand)

// Default command is 'run' for backward compatibility
program.action(() => {
  runCommand({})
})

program.parse()
