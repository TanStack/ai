/**
 * Structured Output Test for Code Mode
 *
 * Tests that code mode analysis can be followed by structured output generation.
 * This is a simplified test to verify the structured output pipeline works.
 */

import { chat, maxIterations } from '@tanstack/ai'
import { z } from 'zod'
import {
  createCodeModeSystemPrompt,
  createCodeModeTool,
} from '@tanstack/ai-code-mode'
import { createNodeIsolateDriver } from '@tanstack/ai-isolate-node'
import {
  addNumbersTool,
  logError,
  logInfo,
  logSection,
  logStep,
  logSuccess,
  logWarning,
} from './test-utils'
import type { AnyTextAdapter, ModelMessage, StreamChunk } from '@tanstack/ai'

/**
 * Schema for the structured math report output
 */
export const MathReportSchema = z.object({
  title: z.string().describe('A title for the math report'),
  operation: z.string().describe('The math operation performed'),
  operands: z.array(z.number()).describe('The numbers involved'),
  result: z.number().describe('The result of the calculation'),
  funFact: z.string().describe('A fun or interesting fact about the result'),
})

export type MathReport = z.infer<typeof MathReportSchema>

/**
 * Options for the structured output test
 */
export interface StructuredOutputTestOptions {
  /**
   * The adapter to use for the LLM
   */
  adapter: AnyTextAdapter

  /**
   * Whether to log verbose output
   */
  verbose?: boolean
}

/**
 * Result from the structured output test
 */
export interface StructuredOutputTestResult {
  passed: boolean
  codeModeExecuted: boolean
  structuredOutputReceived: boolean
  structuredOutput?: MathReport
  error?: string
}

/**
 * Run the structured output test with a real LLM
 */
export async function runStructuredOutputTest(
  options: StructuredOutputTestOptions,
): Promise<StructuredOutputTestResult> {
  const { adapter, verbose = false } = options

  logSection('Structured Output Test')
  logInfo(`Using adapter: ${adapter.name} with model: ${adapter.model}`)

  const driver = createNodeIsolateDriver({
    memoryLimit: 128,
    timeout: 60000,
  })

  const result: StructuredOutputTestResult = {
    passed: false,
    codeModeExecuted: false,
    structuredOutputReceived: false,
  }

  // Create code mode tool
  const codeModeConfig = {
    driver,
    tools: [addNumbersTool],
    timeout: 60000,
    memoryLimit: 128,
  }

  const executeTypescript = createCodeModeTool(codeModeConfig)
  const codeModeSystemPrompt = createCodeModeSystemPrompt(codeModeConfig)

  const systemPrompt = `You are a helpful math assistant that can execute code to perform calculations.
When asked to add numbers, use the execute_typescript tool to call external_add_numbers.

${codeModeSystemPrompt}

After performing the calculation, provide a structured report about the result.`

  // =========================================================================
  // Phase 1: Run Code Mode Analysis
  // =========================================================================

  logSection('Phase 1: Code Mode Execution')
  logStep(1, 'Running code mode to add numbers')

  const messages: Array<ModelMessage> = [
    {
      role: 'user',
      content:
        'Please add 42 and 17 together using code execution, then give me a math report about the result.',
    },
  ]

  try {
    // First, run the code mode analysis
    const analysisStream = chat({
      adapter,
      messages,
      tools: [executeTypescript] as any,
      systemPrompts: [systemPrompt],
      agentLoopStrategy: maxIterations(10),
      maxTokens: 4096,
    })

    let executeTypescriptCalled = false
    let fullContent = ''
    const collectedMessages: Array<ModelMessage> = [...messages]

    for await (const chunk of analysisStream as AsyncIterable<StreamChunk>) {
      if (chunk.type === 'tool_call') {
        const toolName = chunk.toolCall.function.name
        logInfo(`Tool called: ${toolName}`)
        if (verbose) {
          logInfo(
            `  Arguments: ${chunk.toolCall.function.arguments.substring(0, 200)}...`,
          )
        }
        if (toolName === 'execute_typescript') {
          executeTypescriptCalled = true
        }
      } else if (chunk.type === 'tool_result') {
        if (verbose) {
          logInfo(`Tool result: ${chunk.content.substring(0, 200)}...`)
        }
      } else if (chunk.type === 'content') {
        fullContent += chunk.delta
      } else if (chunk.type === 'done') {
        logInfo(`Code mode done: ${chunk.finishReason}`)
      }
    }

    result.codeModeExecuted = executeTypescriptCalled

    if (executeTypescriptCalled) {
      logSuccess('execute_typescript was called')
    } else {
      logWarning(
        'execute_typescript was not called - LLM may have skipped code execution',
      )
    }

    if (verbose && fullContent) {
      logInfo(`LLM analysis: ${fullContent.substring(0, 300)}...`)
    }

    // Save the assistant's response for phase 2
    if (fullContent) {
      collectedMessages.push({
        role: 'assistant',
        content: fullContent,
      })
    }

    // =========================================================================
    // Phase 2: Get Structured Output
    // =========================================================================

    logSection('Phase 2: Structured Output Generation')
    logStep(1, 'Requesting structured math report')

    // Add a follow-up message asking for the structured format
    const structuredRequestMessages = [
      ...collectedMessages,
      {
        role: 'user' as const,
        content:
          'Now provide a structured math report about the calculation you just performed.',
      },
    ]

    // Use chat with outputSchema for structured output
    const structuredResult = await chat({
      adapter,
      messages: structuredRequestMessages,
      systemPrompts: [systemPrompt],
      outputSchema: MathReportSchema,
      maxTokens: 2048,
    })

    logSuccess('Structured output received!')
    result.structuredOutputReceived = true
    result.structuredOutput = structuredResult as MathReport

    if (verbose) {
      logInfo(
        `Structured output: ${JSON.stringify(result.structuredOutput, null, 2)}`,
      )
    }

    // Validate the structured output
    logStep(2, 'Validating structured output')

    const output = result.structuredOutput
    if (!output) {
      logError('Structured output is empty')
    } else {
      // Check required fields exist
      const hasTitle =
        typeof output.title === 'string' && output.title.length > 0
      const hasOperation =
        typeof output.operation === 'string' && output.operation.length > 0
      const hasOperands =
        Array.isArray(output.operands) && output.operands.length > 0
      const hasResult = typeof output.result === 'number'
      const hasFunFact =
        typeof output.funFact === 'string' && output.funFact.length > 0

      logInfo(`  title: ${hasTitle ? '✓' : '✗'} "${output.title}"`)
      logInfo(`  operation: ${hasOperation ? '✓' : '✗'} "${output.operation}"`)
      logInfo(
        `  operands: ${hasOperands ? '✓' : '✗'} [${output.operands?.join(', ')}]`,
      )
      logInfo(`  result: ${hasResult ? '✓' : '✗'} ${output.result}`)
      logInfo(
        `  funFact: ${hasFunFact ? '✓' : '✗'} "${output.funFact?.substring(0, 50)}..."`,
      )

      // Check if the result is correct (42 + 17 = 59)
      const expectedResult = 59
      const resultCorrect = output.result === expectedResult

      if (resultCorrect) {
        logSuccess(`Result is correct: ${output.result} = 42 + 17`)
      } else {
        logWarning(
          `Result may be incorrect: got ${output.result}, expected ${expectedResult}`,
        )
      }

      // Test passes if we got structured output with all required fields
      result.passed =
        hasTitle && hasOperation && hasOperands && hasResult && hasFunFact
    }
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error)
    logError(`Test error: ${result.error}`)
    if (error instanceof Error && error.stack && verbose) {
      console.error(error.stack)
    }
  }

  // =========================================================================
  // Final Result
  // =========================================================================

  logSection('Test Results')

  if (result.passed) {
    logSuccess('Structured Output Test PASSED!')
    logInfo('✓ Code mode executed successfully')
    logInfo('✓ Structured output received and validated')
  } else {
    logError('Structured Output Test FAILED')
    if (!result.codeModeExecuted) {
      logError('  - Code mode was not executed')
    }
    if (!result.structuredOutputReceived) {
      logError('  - Structured output was not received')
    }
    if (result.error) {
      logError(`  - Error: ${result.error}`)
    }
  }

  return result
}
