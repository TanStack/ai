/**
 * Code Mode CLI Test
 *
 * This script tests Code Mode end-to-end with extensive logging for debugging.
 * It mirrors the exact tool setup from ts-code-mode-web for isolated testing.
 *
 * Run with: pnpm test:cli (or npx tsx cli-test.ts)
 *
 * Requires environment variables in .env.local:
 *   - ANTHROPIC_API_KEY (for Anthropic)
 *   - OPENAI_API_KEY (for OpenAI)
 *   - GEMINI_API_KEY (for Gemini)
 *   - GITHUB_TOKEN (for GitHub tools)
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { fileURLToPath } from 'url'

// Load .env.local from the package directory
const __dirname = fileURLToPath(new URL('.', import.meta.url))
config({ path: resolve(__dirname, '.env.local') })

import { chat, maxIterations } from '@tanstack/ai'
import type { StreamChunk, AnyTextAdapter } from '@tanstack/ai'
import {
  createCodeModeSystemPrompt,
  createCodeModeTool,
} from '@tanstack/ai-code-mode'
import { createNodeIsolateDriver } from '@tanstack/ai-isolate-node'
import { anthropicText } from '@tanstack/ai-anthropic'
import { openaiText } from '@tanstack/ai-openai'
import { geminiText } from '@tanstack/ai-gemini'

import { allTools } from './tools'
import { CODE_MODE_SYSTEM_PROMPT } from './prompts'

// =============================================================================
// Console Colors & Logging Utilities
// =============================================================================

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
}

function timestamp(): string {
  return new Date().toISOString().split('T')[1].slice(0, 12)
}

function log(prefix: string, color: string, ...args: unknown[]) {
  console.log(`${color}[${timestamp()}] ${prefix}${COLORS.reset}`, ...args)
}

function logDebug(...args: unknown[]) {
  log('DEBUG', COLORS.dim, ...args)
}

function logInfo(...args: unknown[]) {
  log('INFO ', COLORS.cyan, ...args)
}

function logSuccess(...args: unknown[]) {
  log('OK   ', COLORS.green, ...args)
}

function logWarn(...args: unknown[]) {
  log('WARN ', COLORS.yellow, ...args)
}

function logError(...args: unknown[]) {
  log('ERROR', COLORS.red, ...args)
}

function logChunk(chunkType: string, ...args: unknown[]) {
  const colorMap: Record<string, string> = {
    text: COLORS.white,
    'tool-call': COLORS.magenta,
    'tool-result': COLORS.green,
    custom_event: COLORS.yellow,
    error: COLORS.red,
    finish: COLORS.cyan,
    message_start: COLORS.blue,
    message_complete: COLORS.blue,
  }
  const color = colorMap[chunkType] || COLORS.dim
  log(`CHUNK:${chunkType.padEnd(16)}`, color, ...args)
}

function printHeader(text: string) {
  console.log()
  console.log(`${COLORS.bright}${COLORS.cyan}${'═'.repeat(70)}${COLORS.reset}`)
  console.log(`${COLORS.bright}${COLORS.cyan}  ${text}${COLORS.reset}`)
  console.log(`${COLORS.bright}${COLORS.cyan}${'═'.repeat(70)}${COLORS.reset}`)
}

function printSection(text: string) {
  console.log()
  console.log(`${COLORS.bright}${COLORS.yellow}── ${text} ${'─'.repeat(60 - text.length)}${COLORS.reset}`)
}

function formatJSON(obj: unknown, maxLength = 500): string {
  const str = JSON.stringify(obj, null, 2)
  if (str.length > maxLength) {
    return str.substring(0, maxLength) + '\n... (truncated)'
  }
  return str
}

// =============================================================================
// Parse Command Line Args
// =============================================================================

const args = process.argv.slice(2)
const providerArg =
  args.find((a) => a.startsWith('--provider='))?.split('=')[1] || 'anthropic'
const modelArg = args.find((a) => a.startsWith('--model='))?.split('=')[1]
const promptArg = args.find((a) => a.startsWith('--prompt='))?.split('=')[1]
const verboseArg = args.includes('--verbose') || args.includes('-v')

// =============================================================================
// Provider/Adapter Setup
// =============================================================================

type Provider = 'anthropic' | 'openai' | 'gemini'

function getAdapter(provider: Provider, model?: string): AnyTextAdapter {
  logInfo(`Setting up adapter: provider=${provider}, model=${model || 'default'}`)

  switch (provider) {
    case 'openai':
      if (!process.env.OPENAI_API_KEY) {
        logError('OPENAI_API_KEY environment variable is required')
        process.exit(1)
      }
      return openaiText((model || 'gpt-4o') as 'gpt-4o')
    case 'gemini':
      if (!process.env.GEMINI_API_KEY && !process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
        logError('GEMINI_API_KEY environment variable is required')
        process.exit(1)
      }
      return geminiText((model || 'gemini-2.5-flash') as 'gemini-2.5-flash')
    case 'anthropic':
    default:
      if (!process.env.ANTHROPIC_API_KEY) {
        logError('ANTHROPIC_API_KEY environment variable is required')
        process.exit(1)
      }
      return anthropicText((model || 'claude-sonnet-4-5') as 'claude-sonnet-4-5')
  }
}

// =============================================================================
// Code Mode Setup
// =============================================================================

logInfo('Initializing Code Mode...')

const codeModeConfig = {
  driver: createNodeIsolateDriver(),
  tools: allTools,
  timeout: 60000,
  memoryLimit: 128,
}

logDebug('Code Mode config:', {
  toolCount: allTools.length,
  toolNames: allTools.map((t) => t.definition.name),
  timeout: codeModeConfig.timeout,
  memoryLimit: codeModeConfig.memoryLimit,
})

const executeTypescript = createCodeModeTool(codeModeConfig)
const codeModeSystemPrompt = createCodeModeSystemPrompt(codeModeConfig)

logSuccess('Code Mode tool created successfully')

// =============================================================================
// Stream Processing with Extensive Logging
// =============================================================================

async function processStream(stream: AsyncIterable<StreamChunk>): Promise<{
  textContent: string
  toolCalls: Array<{ id: string; name: string; args: unknown; result?: unknown }>
  customEvents: Array<{ name: string; data: unknown }>
  errors: Array<{ message: string; stack?: string }>
}> {
  const result = {
    textContent: '',
    toolCalls: [] as Array<{ id: string; name: string; args: unknown; result?: unknown }>,
    customEvents: [] as Array<{ name: string; data: unknown }>,
    errors: [] as Array<{ message: string; stack?: string }>,
  }

  const toolCallMap = new Map<string, { name: string; args: unknown }>()
  let chunkCount = 0
  const startTime = Date.now()

  logInfo('Starting stream processing...')

  try {
    for await (const chunk of stream) {
      chunkCount++
      const elapsed = Date.now() - startTime

      if (verboseArg) {
        logDebug(`Chunk #${chunkCount} received after ${elapsed}ms`)
      }

      switch (chunk.type) {
        case 'text':
          if (verboseArg) {
            logChunk('text', `"${chunk.content.substring(0, 100)}${chunk.content.length > 100 ? '...' : ''}"`)
          }
          result.textContent += chunk.content
          // Print text content in real-time
          process.stdout.write(chunk.content)
          break

        case 'tool-call':
          logChunk('tool-call', `id=${chunk.id}, name=${chunk.name}, state=${chunk.state}`)
          if (chunk.state === 'input-streaming' || chunk.state === 'input-complete') {
            if (verboseArg && chunk.arguments) {
              logDebug('Tool arguments (partial):', formatJSON(chunk.arguments, 200))
            }
          }
          if (chunk.state === 'input-complete') {
            toolCallMap.set(chunk.id, { name: chunk.name, args: chunk.arguments })
            logInfo(`Tool call complete: ${chunk.name}`)
            logDebug('Full arguments:', formatJSON(chunk.arguments))
          }
          break

        case 'tool-result':
          logChunk('tool-result', `toolCallId=${chunk.toolCallId}, state=${chunk.state}`)
          const toolCall = toolCallMap.get(chunk.toolCallId)
          if (toolCall) {
            result.toolCalls.push({
              id: chunk.toolCallId,
              name: toolCall.name,
              args: toolCall.args,
              result: chunk.content,
            })
          }
          if (chunk.state === 'complete') {
            logSuccess(`Tool result complete for ${chunk.toolCallId}`)
            if (verboseArg) {
              logDebug('Result content:', formatJSON(chunk.content, 300))
            }
          }
          if (chunk.state === 'error') {
            logError(`Tool error for ${chunk.toolCallId}:`, chunk.error)
            result.errors.push({ message: String(chunk.error) })
          }
          break

        case 'custom_event':
          logChunk('custom_event', `name=${chunk.eventName}`)
          result.customEvents.push({ name: chunk.eventName, data: chunk.data })
          if (verboseArg) {
            logDebug('Event data:', formatJSON(chunk.data, 200))
          }

          // Special handling for code_mode events
          if (chunk.eventName === 'code_mode:execution_started') {
            logInfo('🚀 Code execution started')
          } else if (chunk.eventName === 'code_mode:external_call') {
            const data = chunk.data as { function?: string; args?: unknown }
            logInfo(`⚡ External call: ${data.function}`)
            if (verboseArg) {
              logDebug('  Args:', formatJSON(data.args, 150))
            }
          } else if (chunk.eventName === 'code_mode:external_result') {
            const data = chunk.data as { function?: string; duration?: number }
            logSuccess(`✓ External result: ${data.function} (${data.duration}ms)`)
          } else if (chunk.eventName === 'code_mode:external_error') {
            const data = chunk.data as { function?: string; error?: string }
            logError(`✗ External error: ${data.function} - ${data.error}`)
          } else if (chunk.eventName === 'code_mode:console') {
            const data = chunk.data as { level?: string; message?: string }
            logInfo(`📝 Console.${data.level}: ${data.message}`)
          }
          break

        case 'error':
          logChunk('error', chunk.message)
          result.errors.push({ message: chunk.message })
          break

        case 'finish':
          logChunk('finish', `reason=${chunk.finishReason}`)
          break

        case 'message_start':
          logChunk('message_start', `id=${chunk.messageId}`)
          break

        case 'message_complete':
          logChunk('message_complete', `id=${chunk.messageId}`)
          break

        default:
          if (verboseArg) {
            logChunk((chunk as any).type || 'unknown', formatJSON(chunk, 100))
          }
      }
    }
  } catch (err) {
    logError('Stream processing error:', err)
    result.errors.push({
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    })
  }

  const totalTime = Date.now() - startTime
  console.log() // Newline after streaming text
  logInfo(`Stream complete: ${chunkCount} chunks in ${totalTime}ms`)

  return result
}

// =============================================================================
// Main Test Runner
// =============================================================================

async function runTest(prompt: string) {
  printHeader(`CLI Test: ${prompt}`)

  const adapter = getAdapter(providerArg as Provider, modelArg)
  logInfo(`Using adapter: ${adapter.name} (${adapter.model})`)

  // Check for required tokens
  if (!process.env.GITHUB_TOKEN) {
    logWarn('GITHUB_TOKEN not set - GitHub tools will fail')
  }

  printSection('Creating chat stream')

  const messages = [
    {
      role: 'user' as const,
      content: prompt,
    },
  ]

  logDebug('Messages:', formatJSON(messages))
  logDebug('System prompts length:', CODE_MODE_SYSTEM_PROMPT.length + codeModeSystemPrompt.length)

  const abortController = new AbortController()

  try {
    const startTime = Date.now()
    logInfo('Calling chat()...')

    const stream = chat({
      adapter,
      messages,
      tools: [executeTypescript],
      systemPrompts: [CODE_MODE_SYSTEM_PROMPT, codeModeSystemPrompt],
      agentLoopStrategy: maxIterations(15),
      abortController,
    })

    logSuccess(`Chat stream created in ${Date.now() - startTime}ms`)

    printSection('Processing stream')

    const result = await processStream(stream)

    printSection('Results Summary')

    console.log()
    logInfo(`Text content: ${result.textContent.length} characters`)
    logInfo(`Tool calls: ${result.toolCalls.length}`)
    logInfo(`Custom events: ${result.customEvents.length}`)
    logInfo(`Errors: ${result.errors.length}`)

    if (result.toolCalls.length > 0) {
      console.log()
      logInfo('Tool calls made:')
      for (const tc of result.toolCalls) {
        console.log(`  - ${tc.name} (${tc.id})`)
      }
    }

    if (result.errors.length > 0) {
      console.log()
      logError('Errors encountered:')
      for (const err of result.errors) {
        console.log(`  - ${err.message}`)
        if (err.stack && verboseArg) {
          console.log(`    ${err.stack.split('\n').slice(1, 4).join('\n    ')}`)
        }
      }
    }

    if (result.customEvents.length > 0 && verboseArg) {
      console.log()
      logInfo('Custom events:')
      for (const evt of result.customEvents) {
        console.log(`  - ${evt.name}`)
      }
    }

    printSection('Full Response')
    console.log()
    console.log(result.textContent || '(no text content)')

    return result
  } catch (err) {
    logError('Test failed with exception:', err)
    if (err instanceof Error) {
      console.error(err.stack)
    }
    throw err
  }
}

// =============================================================================
// Entry Point
// =============================================================================

async function main() {
  console.log()
  console.log(`${COLORS.bright}${COLORS.magenta}`)
  console.log('╔═══════════════════════════════════════════════════════════════════╗')
  console.log('║              TanStack AI - Code Mode CLI Test                      ║')
  console.log('║                                                                    ║')
  console.log('║  Same tool setup as ts-code-mode-web with extensive logging        ║')
  console.log('╚═══════════════════════════════════════════════════════════════════╝')
  console.log(`${COLORS.reset}`)

  logInfo('Configuration:')
  console.log(`  Provider: ${providerArg}`)
  console.log(`  Model: ${modelArg || 'default'}`)
  console.log(`  Verbose: ${verboseArg}`)
  console.log()
  logInfo('Environment:')
  console.log(`  ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? '✓ set' : '✗ not set'}`)
  console.log(`  OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✓ set' : '✗ not set'}`)
  console.log(`  GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '✓ set' : '✗ not set'}`)
  console.log(`  GITHUB_TOKEN: ${process.env.GITHUB_TOKEN ? '✓ set' : '✗ not set'}`)
  console.log()
  logInfo('Usage:')
  console.log('  pnpm test:cli --provider=anthropic --prompt="Your question here"')
  console.log('  pnpm test:cli --provider=openai --model=gpt-4o -v')
  console.log('  pnpm test:cli --provider=gemini --verbose')
  console.log()

  // Default test prompts
  const defaultPrompts = [
    'How many downloads did @tanstack/query get last month?',
  ]

  const prompts = promptArg ? [promptArg] : defaultPrompts

  for (const prompt of prompts) {
    try {
      await runTest(prompt)
    } catch (err) {
      logError(`Test failed for prompt: "${prompt}"`)
      // Continue with next prompt
    }
  }

  console.log()
  logSuccess('CLI test complete!')
}

main().catch((err) => {
  logError('Fatal error:', err)
  process.exit(1)
})














