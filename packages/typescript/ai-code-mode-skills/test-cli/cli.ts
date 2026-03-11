#!/usr/bin/env node

/**
 * CLI for testing the TanStack AI Code Mode Skills system
 *
 * Commands:
 * - run: Run tests across multiple adapters (like smoke-tests)
 * - list: List available adapters and tests
 * - live: Run test with a real LLM (single adapter, legacy)
 * - simulated: Run deterministic test with mock adapter
 * - structured: Run structured output test (legacy)
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config } from 'dotenv'
import { Command } from 'commander'
import { runSimulatedTest } from './simulated-test'
import { runRegistryTest } from './registry-test'
import { runLiveTest } from './live-test'
import { runStructuredOutputTest } from './structured-output-test'
import { ADAPTERS, getAdapter } from './adapters'
import { TESTS, getTest, getDefaultTests } from './tests'
import type { AdapterDefinition, AdapterSet } from './adapters'
import type { TestDefinition, TestOutcome } from './tests'
import { colors, logError, logInfo } from './test-utils'

// Load environment variables from test-cli directory
const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = join(__dirname, '.env.local')
const result = config({ path: envPath })
if (result.parsed) {
  // Manually set process.env from parsed values (dotenv may not set them in ESM)
  for (const [key, value] of Object.entries(result.parsed)) {
    process.env[key] = value
  }
}
config({ path: join(__dirname, '.env') })

interface AdapterResult {
  adapter: string
  tests: Record<string, TestOutcome>
}

interface TestTask {
  adapterDef: AdapterDefinition | null // null for simulated test
  adapterSet: AdapterSet | null
  test: TestDefinition
  verbose: boolean
}

/**
 * Get the display width of a string, accounting for emojis
 */
function displayWidth(str: string): number {
  const emojiRegex =
    /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|✅|❌|⚠️/gu
  const emojiCount = (str.match(emojiRegex) || []).length
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
      const envValue = process.env[adapter.envKey]
      const status = envValue ? '✅ Ready' : '⚠️  Missing env'

      console.log(
        `  ${adapter.id.padEnd(10)}  ${adapter.name.padEnd(10)}  ${adapter.envKey.padEnd(19)}  ${status}`,
      )
    }
  }

  if (showAll || options.tests) {
    console.log('\n🧪 Available Tests:\n')
    console.log('  ID   Name                  Requires Adapter  Description')
    console.log('  ---  --------------------  ----------------  -----------')
    for (const test of TESTS) {
      const requires = test.requiresAdapter ? 'Yes' : 'No (mock)'
      console.log(
        `  ${test.id}  ${test.name.padEnd(20)}  ${requires.padEnd(16)}  ${test.description}`,
      )
    }
  }

  console.log('')
}

/**
 * Format the results grid with proper emoji alignment
 */
function formatGrid(results: AdapterResult[], testsRun: TestDefinition[]) {
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
  const formatRow = (row: string[]) =>
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
  running: string[],
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
 * Run tests in parallel with progress display
 */
async function runParallel(
  adaptersToRun: AdapterDefinition[],
  testsToRun: TestDefinition[],
  concurrency: number,
  verbose: boolean,
): Promise<AdapterResult[]> {
  // Build task queue
  const tasks: TestTask[] = []
  const resultsMap = new Map<string, AdapterResult>()
  const skippedAdapters: string[] = []

  // Handle tests that don't need an adapter (mock/simulated tests)
  const mockTests = testsToRun.filter((t) => !t.requiresAdapter)
  if (mockTests.length > 0) {
    // Add Mock adapter result for simulated tests
    const mockResult: AdapterResult = {
      adapter: 'Mock',
      tests: {},
    }
    resultsMap.set('mock', mockResult)
    for (const mockTest of mockTests) {
      tasks.push({
        adapterDef: null,
        adapterSet: null,
        test: mockTest,
        verbose,
      })
    }
  }

  // Handle tests that require adapters
  const adapterTests = testsToRun.filter((t) => t.requiresAdapter)

  for (const adapterDef of adaptersToRun) {
    const adapterSet = await adapterDef.create()

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

    for (const test of adapterTests) {
      tasks.push({ adapterDef, adapterSet, test, verbose })
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
    const taskName = task.adapterDef
      ? `${task.adapterDef.name}/${task.test.id}`
      : `Mock/${task.test.id}`
    running.add(taskName)
    updateProgress(completed, total, Array.from(running), failed)

    try {
      const adapter = task.adapterSet?.adapter || null
      const outcome = await task.test.run(adapter, task.verbose)

      const resultKey = task.adapterDef ? task.adapterDef.id : 'mock'
      const adapterResult = resultsMap.get(resultKey)!
      adapterResult.tests[task.test.id] = outcome

      if (!outcome.passed && !outcome.ignored) {
        failed++
        failedTests.push({
          name: taskName,
          error: outcome.error || 'Unknown error',
        })
      }
    } catch (error: any) {
      const resultKey = task.adapterDef ? task.adapterDef.id : 'mock'
      const adapterResult = resultsMap.get(resultKey)!
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
  const workers: Promise<void>[] = []

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

  // Return results in order: Mock first (if exists), then adapters
  const orderedResults: AdapterResult[] = []
  const mockResult = resultsMap.get('mock')
  if (mockResult) {
    orderedResults.push(mockResult)
  }
  for (const adapterDef of adaptersToRun) {
    const result = resultsMap.get(adapterDef.id)
    if (result) {
      orderedResults.push(result)
    }
  }
  return orderedResults
}

/**
 * Run tests with optional filtering
 */
async function runCommand(options: {
  adapters?: string
  tests?: string
  parallel?: string
  verbose?: boolean
}) {
  console.log(`${colors.bright}${colors.cyan}`)
  console.log('╔═══════════════════════════════════════════════════════════╗')
  console.log('║     TanStack AI Code Mode Skills - Multi-Adapter Tests    ║')
  console.log('╚═══════════════════════════════════════════════════════════╝')
  console.log(colors.reset)

  // Parse adapter filter
  const adapterFilter = options.adapters
    ? options.adapters.split(',').map((a) => a.trim().toLowerCase())
    : null

  // Parse test filter
  const testFilter = options.tests
    ? options.tests.split(',').map((t) => t.trim().toUpperCase())
    : null

  // Parse parallel option (default to 3)
  const parallel = options.parallel ? parseInt(options.parallel, 10) : 3
  const verbose = options.verbose || false

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
    testsToRun = getDefaultTests()
  }

  console.log('🚀 Starting skills tests')
  console.log(`   Adapters: ${adaptersToRun.map((a) => a.name).join(', ')}`)
  console.log(`   Tests: ${testsToRun.map((t) => t.id).join(', ')}`)
  console.log(`   Parallel: ${parallel}`)

  // Run tests
  const results = await runParallel(
    adaptersToRun,
    testsToRun,
    parallel,
    verbose,
  )

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

const program = new Command()
  .name('skills-test')
  .description('Test the TanStack AI Code Mode Skills system')
  .version('0.0.1')

// Run command (primary)
program
  .command('run')
  .description('Run tests across adapters (like smoke-tests)')
  .option(
    '--adapters <names>',
    'Comma-separated list of adapters (e.g., openai,anthropic,gemini)',
  )
  .option(
    '--tests <ids>',
    'Comma-separated list of test IDs (e.g., SIM,SKL,STR)',
  )
  .option(
    '--parallel <n>',
    'Number of tests to run in parallel (default: 3)',
    '3',
  )
  .option('-v, --verbose', 'Enable verbose output')
  .action(runCommand)

// List command
program
  .command('list')
  .description('List available adapters and tests')
  .option('--adapters', 'List adapters only')
  .option('--tests', 'List tests only')
  .action(listCommand)

// Simulated test command (legacy)
program
  .command('simulated')
  .description('Run deterministic test with mock adapter (no API key needed)')
  .action(async () => {
    console.log(`${colors.bright}${colors.cyan}`)
    console.log('╔═══════════════════════════════════════════════════════════╗')
    console.log('║       TanStack AI Code Mode Skills - Simulated Test       ║')
    console.log('╚═══════════════════════════════════════════════════════════╝')
    console.log(colors.reset)

    try {
      const result = await runSimulatedTest()

      if (result.passed) {
        process.exit(0)
      } else {
        process.exit(1)
      }
    } catch (error) {
      logError(
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      )
      process.exit(1)
    }
  })

// Registry test command
program
  .command('registry')
  .description('Run ToolRegistry dynamic registration test (no API key needed)')
  .action(async () => {
    console.log(`${colors.bright}${colors.cyan}`)
    console.log('╔═══════════════════════════════════════════════════════════╗')
    console.log('║       TanStack AI Code Mode Skills - Registry Test        ║')
    console.log('╚═══════════════════════════════════════════════════════════╝')
    console.log(colors.reset)

    try {
      const result = await runRegistryTest()

      if (result.passed) {
        process.exit(0)
      } else {
        process.exit(1)
      }
    } catch (error) {
      logError(
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      )
      process.exit(1)
    }
  })

// Live test command (legacy)
program
  .command('live')
  .description('Run test with a real LLM (requires API key)')
  .option(
    '--provider <provider>',
    'LLM provider to use (openai, anthropic, or gemini)',
    'openai',
  )
  .option('--model <model>', 'Model to use (default depends on provider)')
  .option('-v, --verbose', 'Enable verbose output')
  .action(async (options) => {
    console.log(`${colors.bright}${colors.cyan}`)
    console.log('╔═══════════════════════════════════════════════════════════╗')
    console.log('║         TanStack AI Code Mode Skills - Live Test          ║')
    console.log('╚═══════════════════════════════════════════════════════════╝')
    console.log(colors.reset)

    const { provider, model, verbose } = options

    // Get the appropriate adapter
    let adapter: any

    if (provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) {
        logError('OPENAI_API_KEY environment variable is not set')
        logInfo(
          'Set it in test-cli/.env.local or export it: export OPENAI_API_KEY=sk-...',
        )
        process.exit(1)
      }

      try {
        const { openaiText } = await import('@tanstack/ai-openai')
        const modelName = model || 'gpt-4o'
        adapter = openaiText(modelName, { apiKey })
        logInfo(`Using OpenAI adapter with model: ${modelName}`)
      } catch (error) {
        logError(
          'Failed to load OpenAI adapter. Make sure @tanstack/ai-openai is installed.',
        )
        logInfo('Run: pnpm add @tanstack/ai-openai')
        process.exit(1)
      }
    } else if (provider === 'anthropic') {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) {
        logError('ANTHROPIC_API_KEY environment variable is not set')
        logInfo(
          'Set it in test-cli/.env.local or export it: export ANTHROPIC_API_KEY=sk-ant-...',
        )
        process.exit(1)
      }

      try {
        const { anthropicText } = await import('@tanstack/ai-anthropic')
        const modelName = model || 'claude-sonnet-4-20250514'
        adapter = anthropicText(modelName, { apiKey })
        logInfo(`Using Anthropic adapter with model: ${modelName}`)
      } catch (error) {
        logError(
          'Failed to load Anthropic adapter. Make sure @tanstack/ai-anthropic is installed.',
        )
        logInfo('Run: pnpm add @tanstack/ai-anthropic')
        process.exit(1)
      }
    } else if (provider === 'gemini') {
      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
      if (!apiKey) {
        logError('GEMINI_API_KEY environment variable is not set')
        logInfo(
          'Set it in test-cli/.env.local or export it: export GEMINI_API_KEY=...',
        )
        process.exit(1)
      }

      try {
        const { geminiText } = await import('@tanstack/ai-gemini')
        const modelName = model || 'gemini-2.0-flash'
        adapter = geminiText(modelName, { apiKey })
        logInfo(`Using Gemini adapter with model: ${modelName}`)
      } catch (error) {
        logError(
          'Failed to load Gemini adapter. Make sure @tanstack/ai-gemini is installed.',
        )
        logInfo('Run: pnpm add @tanstack/ai-gemini')
        process.exit(1)
      }
    } else {
      logError(`Unknown provider: ${provider}`)
      logInfo('Supported providers: openai, anthropic, gemini')
      process.exit(1)
    }

    try {
      const result = await runLiveTest({
        adapter,
        verbose,
      })

      if (result.passed) {
        process.exit(0)
      } else {
        process.exit(1)
      }
    } catch (error) {
      logError(
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      )
      if (error instanceof Error && error.stack) {
        console.error(error.stack)
      }
      process.exit(1)
    }
  })

// Structured output test command (legacy)
program
  .command('structured')
  .description('Test structured output with code mode (requires API key)')
  .option(
    '--provider <provider>',
    'LLM provider to use (openai, anthropic, or gemini)',
    'openai',
  )
  .option('--model <model>', 'Model to use (default depends on provider)')
  .option('-v, --verbose', 'Enable verbose output')
  .action(async (options) => {
    console.log(`${colors.bright}${colors.cyan}`)
    console.log('╔═══════════════════════════════════════════════════════════╗')
    console.log('║     TanStack AI Code Mode - Structured Output Test        ║')
    console.log('╚═══════════════════════════════════════════════════════════╝')
    console.log(colors.reset)

    const { provider, model, verbose } = options

    // Get the appropriate adapter
    let adapter: any

    if (provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) {
        logError('OPENAI_API_KEY environment variable is not set')
        logInfo(
          'Set it in test-cli/.env.local or export it: export OPENAI_API_KEY=sk-...',
        )
        process.exit(1)
      }

      try {
        const { openaiText } = await import('@tanstack/ai-openai')
        const modelName = model || 'gpt-4o'
        adapter = openaiText(modelName, { apiKey })
        logInfo(`Using OpenAI adapter with model: ${modelName}`)
      } catch (error) {
        logError(
          'Failed to load OpenAI adapter. Make sure @tanstack/ai-openai is installed.',
        )
        process.exit(1)
      }
    } else if (provider === 'anthropic') {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) {
        logError('ANTHROPIC_API_KEY environment variable is not set')
        logInfo(
          'Set it in test-cli/.env.local or export it: export ANTHROPIC_API_KEY=sk-ant-...',
        )
        process.exit(1)
      }

      try {
        const { anthropicText } = await import('@tanstack/ai-anthropic')
        const modelName = model || 'claude-sonnet-4-20250514'
        adapter = anthropicText(modelName, { apiKey })
        logInfo(`Using Anthropic adapter with model: ${modelName}`)
      } catch (error) {
        logError(
          'Failed to load Anthropic adapter. Make sure @tanstack/ai-anthropic is installed.',
        )
        process.exit(1)
      }
    } else if (provider === 'gemini') {
      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
      if (!apiKey) {
        logError('GEMINI_API_KEY environment variable is not set')
        logInfo(
          'Set it in test-cli/.env.local or export it: export GEMINI_API_KEY=...',
        )
        process.exit(1)
      }

      try {
        const { geminiText } = await import('@tanstack/ai-gemini')
        const modelName = model || 'gemini-2.0-flash'
        adapter = geminiText(modelName, { apiKey })
        logInfo(`Using Gemini adapter with model: ${modelName}`)
      } catch (error) {
        logError(
          'Failed to load Gemini adapter. Make sure @tanstack/ai-gemini is installed.',
        )
        process.exit(1)
      }
    } else {
      logError(`Unknown provider: ${provider}`)
      logInfo('Supported providers: openai, anthropic, gemini')
      process.exit(1)
    }

    try {
      const result = await runStructuredOutputTest({
        adapter,
        verbose,
      })

      if (result.passed) {
        process.exit(0)
      } else {
        process.exit(1)
      }
    } catch (error) {
      logError(
        `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      )
      if (error instanceof Error && error.stack) {
        console.error(error.stack)
      }
      process.exit(1)
    }
  })

// Default action - run all tests
program.action(() => {
  runCommand({})
})

// Parse command line
program.parse()
