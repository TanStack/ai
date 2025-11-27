import { config } from 'dotenv'
import {
  chat,
  embedding,
  summarize,
  tool,
  maxIterations,
  type Tool,
} from '@tanstack/ai'
import { createAnthropic } from '@tanstack/ai-anthropic'
import { createGemini } from '@tanstack/ai-gemini'
import { ollama } from '@tanstack/ai-ollama'
import { createOpenAI } from '@tanstack/ai-openai'
import {
  AdapterContext,
  buildApprovalMessages,
  captureStream,
  createDebugEnvelope,
  runTestCase,
  summarizeRun,
  writeDebugFile,
} from './harness'

// Load .env.local first (higher priority), then .env
config({ path: '.env.local' })
config({ path: '.env' })

const ANTHROPIC_MODEL =
  process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-20241022'
const ANTHROPIC_SUMMARY_MODEL =
  process.env.ANTHROPIC_SUMMARY_MODEL || ANTHROPIC_MODEL
const ANTHROPIC_EMBEDDING_MODEL =
  process.env.ANTHROPIC_EMBEDDING_MODEL || ANTHROPIC_MODEL

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'
const OPENAI_SUMMARY_MODEL = process.env.OPENAI_SUMMARY_MODEL || OPENAI_MODEL
const OPENAI_EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'

const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash-lite'
const GEMINI_SUMMARY_MODEL = process.env.GEMINI_SUMMARY_MODEL || GEMINI_MODEL
const GEMINI_EMBEDDING_MODEL =
  process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001'

// Using llama3.2:3b for better stability with approval flows
// granite4:3b was flaky with approval-required tools
// Can override via OLLAMA_MODEL env var if needed
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'mistral:7b'
const OLLAMA_SUMMARY_MODEL = process.env.OLLAMA_SUMMARY_MODEL || OLLAMA_MODEL
const OLLAMA_EMBEDDING_MODEL =
  process.env.OLLAMA_EMBEDDING_MODEL || 'nomic-embed-text'

type TestOutcome = { passed: boolean; error?: string; ignored?: boolean }

interface AdapterResult {
  adapter: string
  model: string
  summarizeModel: string
  embeddingModel: string
  tests: Record<string, TestOutcome>
}

interface AdapterConfig {
  name: string
  chatModel: string
  summarizeModel: string
  embeddingModel: string
  adapter: any
}

interface TestDefinition {
  id: string
  label: string
  run: (ctx: AdapterContext) => Promise<TestOutcome>
}

async function testCapitalOfFrance(
  adapterContext: AdapterContext,
): Promise<TestOutcome> {
  return runTestCase({
    adapterContext,
    testName: 'test1-chat-stream',
    description: 'chat stream returns Paris for capital of France',
    messages: [
      { role: 'user' as const, content: 'what is the capital of france' },
    ],
    validate: (run) => {
      const hasParis = run.fullResponse.toLowerCase().includes('paris')
      return {
        passed: hasParis,
        error: hasParis ? undefined : "Response does not contain 'Paris'",
        meta: { hasParis },
      }
    },
  })
}

async function testTemperatureTool(
  adapterContext: AdapterContext,
): Promise<TestOutcome> {
  let toolExecuteCalled = false
  let toolExecuteCallCount = 0
  const toolExecuteCalls: Array<{
    timestamp: string
    arguments: any
    result?: string
    error?: string
  }> = []

  const expectedLocation = 'San Francisco'

  const temperatureTool = tool({
    type: 'function',
    function: {
      name: 'get_temperature',
      description:
        'Get the current temperature in degrees for a specific location',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'The city or location to get the temperature for',
          },
        },
        required: ['location'],
      },
    },
    execute: async (args: any) => {
      toolExecuteCalled = true
      toolExecuteCallCount++
      const callInfo: any = {
        timestamp: new Date().toISOString(),
        arguments: args,
      }
      try {
        // Verify location was passed correctly
        if (!args || typeof args !== 'object') {
          throw new Error('Arguments must be an object')
        }
        if (!args.location || typeof args.location !== 'string') {
          throw new Error('Location argument is missing or invalid')
        }

        const result = '70'
        callInfo.result = result
        toolExecuteCalls.push(callInfo)
        return result
      } catch (error: any) {
        callInfo.error = error.message
        toolExecuteCalls.push(callInfo)
        throw error
      }
    },
  })

  return runTestCase({
    adapterContext,
    testName: 'test2-temperature-tool',
    description:
      'tool call with location parameter returns a temperature value',
    messages: [
      {
        role: 'user' as const,
        content: `use the get_temperature tool to get the temperature for ${expectedLocation} and report the answer as a number`,
      },
    ],
    tools: [temperatureTool],
    agentLoopStrategy: maxIterations(20),
    validate: (run) => {
      const responseLower = run.fullResponse.toLowerCase()
      const hasSeventy =
        responseLower.includes('70') || responseLower.includes('seventy')
      const toolCallFound = run.toolCalls.length > 0
      const toolResultFound = run.toolResults.length > 0

      // Check that location was passed correctly
      const locationPassedCorrectly = toolExecuteCalls.some(
        (call) =>
          call.arguments &&
          call.arguments.location &&
          typeof call.arguments.location === 'string' &&
          call.arguments.location.length > 0,
      )

      // Check if the location matches what was requested (case-insensitive)
      const locationMatches = toolExecuteCalls.some(
        (call) =>
          call.arguments &&
          call.arguments.location &&
          call.arguments.location
            .toLowerCase()
            .includes(expectedLocation.toLowerCase()),
      )

      const issues: string[] = []
      if (!toolCallFound) issues.push('no tool call')
      if (!toolResultFound) issues.push('no tool result')
      if (!hasSeventy) issues.push("no '70' or 'seventy' in response")
      if (!locationPassedCorrectly)
        issues.push('location argument not passed or invalid')
      if (!locationMatches) {
        issues.push(
          `location argument '${
            toolExecuteCalls[0]?.arguments?.location || 'missing'
          }' does not match expected '${expectedLocation}'`,
        )
      }

      return {
        passed:
          toolCallFound &&
          toolResultFound &&
          hasSeventy &&
          locationPassedCorrectly &&
          locationMatches,
        error: issues.length ? issues.join(', ') : undefined,
        meta: {
          hasSeventy,
          toolCallFound,
          toolResultFound,
          toolExecuteCalled,
          toolExecuteCallCount,
          toolExecuteCalls,
          locationPassedCorrectly,
          locationMatches,
          expectedLocation,
          actualLocation: toolExecuteCalls[0]?.arguments?.location,
        },
      }
    },
  })
}

async function testApprovalToolFlow(
  adapterContext: AdapterContext,
): Promise<TestOutcome> {
  const testName = 'test3-approval-tool-flow'

  let toolExecuteCalled = false
  let toolExecuteCallCount = 0
  const toolExecuteCalls: Array<{
    timestamp: string
    arguments: any
    result?: string
    error?: string
  }> = []

  const addToCartTool: Tool = {
    type: 'function',
    function: {
      name: 'addToCart',
      description: 'Add an item to the shopping cart',
      parameters: {
        type: 'object',
        properties: {
          item: {
            type: 'string',
            description: 'The name of the item to add to the cart',
          },
        },
        required: ['item'],
      },
    },
    needsApproval: true,
    execute: async (args: any) => {
      toolExecuteCalled = true
      toolExecuteCallCount++
      const callInfo: any = {
        timestamp: new Date().toISOString(),
        arguments: args,
      }
      try {
        const result = JSON.stringify({ success: true, item: args.item })
        callInfo.result = result
        toolExecuteCalls.push(callInfo)
        return result
      } catch (error: any) {
        callInfo.error = error.message
        toolExecuteCalls.push(callInfo)
        throw error
      }
    },
  }

  const messages = [
    {
      role: 'user' as const,
      content: 'add a hammer to the cart',
    },
  ]

  const debugData = createDebugEnvelope(
    adapterContext.adapterName,
    testName,
    adapterContext.model,
    messages,
    [addToCartTool],
  )

  const requestRun = await captureStream({
    adapterName: adapterContext.adapterName,
    testName,
    phase: 'request',
    adapter: adapterContext.adapter,
    model: adapterContext.model,
    messages,
    tools: [addToCartTool],
    agentLoopStrategy: maxIterations(20),
  })

  const approval = requestRun.approvalRequests[0]
  const toolCall = requestRun.toolCalls[0]

  if (!approval || !toolCall) {
    const error = `No approval request found. toolCalls: ${requestRun.toolCalls.length}, approvals: ${requestRun.approvalRequests.length}`
    debugData.summary = {
      request: summarizeRun(requestRun),
      toolExecuteCalled,
      toolExecuteCallCount,
      toolExecuteCalls,
    }
    debugData.chunks = requestRun.chunks
    debugData.result = { passed: false, error }
    await writeDebugFile(adapterContext.adapterName, testName, debugData)
    console.log(`[${adapterContext.adapterName}] ❌ ${testName}: ${error}`)
    return { passed: false, error }
  }

  const approvalMessages = buildApprovalMessages(messages, requestRun, approval)

  const approvedRun = await captureStream({
    adapterName: adapterContext.adapterName,
    testName,
    phase: 'approved',
    adapter: adapterContext.adapter,
    model: adapterContext.model,
    messages: approvalMessages,
    tools: [addToCartTool],
    agentLoopStrategy: maxIterations(20),
  })

  const fullResponse = requestRun.fullResponse + ' ' + approvedRun.fullResponse
  const hasHammerInResponse = fullResponse.toLowerCase().includes('hammer')
  const passed =
    requestRun.toolCalls.length > 0 &&
    requestRun.approvalRequests.length > 0 &&
    toolExecuteCalled &&
    toolExecuteCallCount === 1 &&
    hasHammerInResponse

  debugData.chunks = [...requestRun.chunks, ...approvedRun.chunks]
  debugData.finalMessages = approvedRun.reconstructedMessages
  debugData.summary = {
    request: summarizeRun(requestRun),
    approved: summarizeRun(approvedRun),
    hasHammerInResponse,
    toolExecuteCalled,
    toolExecuteCallCount,
    toolExecuteCalls,
  }
  debugData.result = {
    passed,
    error: passed
      ? undefined
      : `toolCallFound: ${
          requestRun.toolCalls.length > 0
        }, approvalRequestFound: ${
          requestRun.approvalRequests.length > 0
        }, toolExecuteCalled: ${toolExecuteCalled}, toolExecuteCallCount: ${toolExecuteCallCount}, hasHammerInResponse: ${hasHammerInResponse}`,
  }

  await writeDebugFile(adapterContext.adapterName, testName, debugData)
  console.log(
    `[${adapterContext.adapterName}] ${passed ? '✅' : '❌'} ${testName}${
      passed ? '' : `: ${debugData.result.error}`
    }`,
  )

  return { passed, error: debugData.result.error }
}

async function testSummarize(
  adapterContext: AdapterContext,
): Promise<TestOutcome> {
  const testName = 'test5-summarize'
  const adapterName = adapterContext.adapterName
  const model = adapterContext.summarizeModel || adapterContext.model
  const text =
    'Paris is the capital and most populous city of France, known for landmarks like the Eiffel Tower and the Louvre. It is a major center for art, fashion, gastronomy, and culture.'

  const debugData: Record<string, any> = {
    adapter: adapterName,
    test: testName,
    model,
    timestamp: new Date().toISOString(),
    input: { text, maxLength: 80, style: 'concise' as const },
  }

  try {
    const result = await summarize({
      adapter: adapterContext.adapter,
      model,
      text,
      maxLength: 80,
      style: 'concise',
    })

    const summary = result.summary || ''
    const summaryLower = summary.toLowerCase()
    const passed = summary.length > 0 && summaryLower.includes('paris')

    debugData.summary = {
      summary,
      usage: result.usage,
      summaryLength: summary.length,
    }
    debugData.result = {
      passed,
      error: passed ? undefined : "Summary missing 'Paris'",
    }

    await writeDebugFile(adapterName, testName, debugData)

    console.log(
      `[${adapterName}] ${passed ? '✅' : '❌'} ${testName}${
        passed ? '' : `: ${debugData.result.error}`
      }`,
    )

    return { passed, error: debugData.result.error }
  } catch (error: any) {
    const message = error?.message || String(error)
    debugData.summary = { error: message }
    debugData.result = { passed: false, error: message }
    await writeDebugFile(adapterName, testName, debugData)
    console.log(`[${adapterName}] ❌ ${testName}: ${message}`)
    return { passed: false, error: message }
  }
}

async function testEmbedding(
  adapterContext: AdapterContext,
): Promise<TestOutcome> {
  const testName = 'test6-embedding'
  const adapterName = adapterContext.adapterName

  // Anthropic embedding is not supported, mark as ignored
  if (adapterName === 'Anthropic') {
    console.log(`[${adapterName}] ⋯ ${testName}: Ignored (not supported)`)
    return { passed: true, ignored: true }
  }

  const model = adapterContext.embeddingModel || adapterContext.model
  const inputs = [
    'The Eiffel Tower is located in Paris.',
    'The Colosseum is located in Rome.',
  ]

  const debugData: Record<string, any> = {
    adapter: adapterName,
    test: testName,
    model,
    timestamp: new Date().toISOString(),
    input: { inputs },
  }

  try {
    const result = await embedding({
      adapter: adapterContext.adapter,
      model,
      input: inputs,
    })

    const embeddings = result.embeddings || []
    const lengths = embeddings.map((e) => e?.length || 0)
    const vectorsAreNumeric = embeddings.every(
      (vec) => Array.isArray(vec) && vec.every((n) => typeof n === 'number'),
    )
    const passed =
      embeddings.length === inputs.length &&
      vectorsAreNumeric &&
      lengths.every((len) => len > 0)

    debugData.summary = {
      embeddingLengths: lengths,
      firstEmbeddingPreview: embeddings[0]?.slice(0, 8),
      usage: result.usage,
    }
    debugData.result = {
      passed,
      error: passed ? undefined : 'Embeddings missing, empty, or invalid',
    }

    await writeDebugFile(adapterName, testName, debugData)

    console.log(
      `[${adapterName}] ${passed ? '✅' : '❌'} ${testName}${
        passed ? '' : `: ${debugData.result.error}`
      }`,
    )

    return { passed, error: debugData.result.error }
  } catch (error: any) {
    const message = error?.message || String(error)
    debugData.summary = { error: message }
    debugData.result = { passed: false, error: message }
    await writeDebugFile(adapterName, testName, debugData)
    console.log(`[${adapterName}] ❌ ${testName}: ${message}`)
    return { passed: false, error: message }
  }
}

const TEST_DEFINITIONS: TestDefinition[] = [
  { id: 'chat-stream', label: 'chat (stream)', run: testCapitalOfFrance },
  { id: 'tools', label: 'tools', run: testTemperatureTool },
  { id: 'approval', label: 'approval', run: testApprovalToolFlow },
  { id: 'summarize', label: 'summarize', run: testSummarize },
  { id: 'embedding', label: 'embedding', run: testEmbedding },
]

function shouldTestAdapter(adapterName: string, filter?: string): boolean {
  if (!filter) return true
  return adapterName.toLowerCase() === filter.toLowerCase()
}

function formatGrid(results: AdapterResult[]) {
  const headers = ['Adapter', ...TEST_DEFINITIONS.map((t) => t.label)]
  const rows = results.map((result) => [
    `${result.adapter} (chat: ${result.model})`,
    ...TEST_DEFINITIONS.map((test) => {
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
    row.map((cell, idx) => cell.padEnd(colWidths[idx])).join(' | ')

  console.log(formatRow(headers))
  console.log(separator)
  rows.forEach((row) => console.log(formatRow(row)))
}

async function runTests(filterAdapter?: string) {
  if (filterAdapter) {
    console.log(`🚀 Starting adapter tests for: ${filterAdapter}`)
  } else {
    console.log('🚀 Starting adapter tests for all adapters')
  }

  const results: AdapterResult[] = []

  const runAdapterSuite = async (config: AdapterConfig) => {
    const ctx: AdapterContext = {
      adapterName: config.name,
      adapter: config.adapter,
      model: config.chatModel,
      summarizeModel: config.summarizeModel,
      embeddingModel: config.embeddingModel,
    }

    const adapterResult: AdapterResult = {
      adapter: config.name,
      model: config.chatModel,
      summarizeModel: config.summarizeModel,
      embeddingModel: config.embeddingModel,
      tests: {},
    }

    console.log(
      `\n${config.name} (chat: ${config.chatModel}, summarize: ${config.summarizeModel}, embedding: ${config.embeddingModel})`,
    )

    for (const test of TEST_DEFINITIONS) {
      adapterResult.tests[test.id] = await test.run(ctx)
    }

    results.push(adapterResult)
  }

  // Anthropic
  if (shouldTestAdapter('Anthropic', filterAdapter)) {
    const anthropicApiKey = process.env.ANTHROPIC_API_KEY
    if (anthropicApiKey) {
      await runAdapterSuite({
        name: 'Anthropic',
        chatModel: ANTHROPIC_MODEL,
        summarizeModel: ANTHROPIC_SUMMARY_MODEL,
        embeddingModel: ANTHROPIC_EMBEDDING_MODEL,
        adapter: createAnthropic(anthropicApiKey),
      })
    } else {
      console.log('⚠️  Skipping Anthropic tests: ANTHROPIC_API_KEY not set')
    }
  }

  // OpenAI
  if (shouldTestAdapter('OpenAI', filterAdapter)) {
    const openaiApiKey = process.env.OPENAI_API_KEY
    if (openaiApiKey) {
      await runAdapterSuite({
        name: 'OpenAI',
        chatModel: OPENAI_MODEL,
        summarizeModel: OPENAI_SUMMARY_MODEL,
        embeddingModel: OPENAI_EMBEDDING_MODEL,
        adapter: createOpenAI(openaiApiKey),
      })
    } else {
      console.log('⚠️  Skipping OpenAI tests: OPENAI_API_KEY not set')
    }
  }

  // Gemini
  if (shouldTestAdapter('Gemini', filterAdapter)) {
    const geminiApiKey =
      process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY
    if (geminiApiKey) {
      await runAdapterSuite({
        name: 'Gemini',
        chatModel: GEMINI_MODEL,
        summarizeModel: GEMINI_SUMMARY_MODEL,
        embeddingModel: GEMINI_EMBEDDING_MODEL,
        adapter: createGemini(geminiApiKey),
      })
    } else {
      console.log(
        '⚠️  Skipping Gemini tests: GEMINI_API_KEY or GOOGLE_API_KEY not set',
      )
    }
  }

  // Ollama
  if (shouldTestAdapter('Ollama', filterAdapter)) {
    await runAdapterSuite({
      name: 'Ollama',
      chatModel: OLLAMA_MODEL,
      summarizeModel: OLLAMA_SUMMARY_MODEL,
      embeddingModel: OLLAMA_EMBEDDING_MODEL,
      adapter: ollama(),
    })
  }

  console.log('\n')

  if (results.length === 0) {
    console.log('\n⚠️  No tests were run.')
    if (filterAdapter) {
      console.log(
        `   The adapter "${filterAdapter}" may not be configured or available.`,
      )
    }
    process.exit(1)
  }

  formatGrid(results)

  const allPassed = results.every((result) =>
    TEST_DEFINITIONS.every((test) => {
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

// Get adapter name from command line arguments (e.g., "pnpm start ollama")
const filterAdapter = process.argv[2]

// Validate adapter name if provided
if (filterAdapter) {
  const validAdapters = ['anthropic', 'openai', 'gemini', 'ollama']
  const normalizedFilter = filterAdapter.toLowerCase()
  if (!validAdapters.includes(normalizedFilter)) {
    console.error(
      `❌ Invalid adapter name: "${filterAdapter}"\n` +
        `Valid adapters: ${validAdapters.join(', ')}`,
    )
    process.exit(1)
  }
}

runTests(filterAdapter).catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
