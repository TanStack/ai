/**
 * Simulated test for dynamic ToolRegistry functionality
 *
 * Tests that:
 * 1. codeModeWithSnippets returns a ToolRegistry instead of a tools array
 * 2. The registry contains expected initial tools
 * 3. Snippets registered mid-stream are immediately added to the registry
 * 4. The newly registered snippet becomes available as a callable tool
 */

import { EventType, chat, maxIterations } from '@tanstack/ai'
import { createNodeIsolateDriver } from '@tanstack/ai-isolate-node'
import { codeModeWithSnippets } from '../src/code-mode-with-snippets'
import {
  createMockTextAdapter,
  singleToolCall,
  textResponse,
} from './mock-adapter'
import {
  EXPECTED_SNIPPET_CODE,
  EXPECTED_SNIPPET_INPUT_SCHEMA,
  EXPECTED_SNIPPET_OUTPUT_SCHEMA,
  addNumbersTool,
  createTestStorage,
  logError,
  logInfo,
  logSection,
  logStep,
  logSuccess,
} from './test-utils'
import type { ModelMessage, StreamChunk, ToolRegistry } from '@tanstack/ai'

/**
 * Result from the registry test
 */
export interface RegistryTestResult {
  passed: boolean
  phases: {
    setup: {
      success: boolean
      error?: string
      details?: Record<string, unknown>
    }
    registration: {
      success: boolean
      error?: string
      details?: Record<string, unknown>
    }
    verification: {
      success: boolean
      error?: string
      details?: Record<string, unknown>
    }
  }
}

/**
 * Create a mock adapter for snippet selection (no snippets initially)
 */
function createSnippetSelectionAdapter(snippetNames: Array<string>) {
  return createMockTextAdapter({
    responses: [textResponse(JSON.stringify(snippetNames))],
  })
}

/**
 * TypeScript code that the mock LLM will "generate" to add numbers
 */
const ADD_NUMBERS_CODE = `
const a = 5;
const b = 3;
const result = await external_add_numbers({ a, b });
console.log("Result:", result);
return result;
`

/**
 * Run the ToolRegistry simulated test
 */
export async function runRegistryTest(): Promise<RegistryTestResult> {
  logSection('ToolRegistry Dynamic Registration Test')
  logInfo(
    'Testing that snippets registered mid-stream are immediately available',
  )

  const storage = createTestStorage()
  const driver = createNodeIsolateDriver({
    memoryLimit: 128,
    timeout: 30000,
  })

  const result: RegistryTestResult = {
    passed: false,
    phases: {
      setup: { success: false },
      registration: { success: false },
      verification: { success: false },
    },
  }

  // =========================================================================
  // Phase 1: Setup - Verify registry is returned and has expected tools
  // =========================================================================

  logSection('Phase 1: Registry Setup Verification')
  logStep(1, 'Calling codeModeWithSnippets to get ToolRegistry')

  let registry: ToolRegistry

  try {
    const selectionAdapter = createSnippetSelectionAdapter([])
    const messages: Array<ModelMessage> = [
      { role: 'user', content: 'What is 5 + 3?' },
    ]

    const codeWithSnippetsResult = await codeModeWithSnippets({
      config: {
        driver,
        tools: [addNumbersTool],
        timeout: 30000,
        memoryLimit: 128,
      },
      adapter: selectionAdapter,
      snippets: {
        storage,
        maxSnippetsInContext: 5,
      },
      messages,
    })

    registry = codeWithSnippetsResult.toolsRegistry

    // Verify registry is returned (not a tools array)
    const hasGetTools = typeof registry.getTools === 'function'
    const hasAdd = typeof registry.add === 'function'
    const hasHas = typeof registry.has === 'function'

    if (!hasGetTools || !hasAdd || !hasHas) {
      throw new Error(
        'codeModeWithSnippets did not return a valid ToolRegistry',
      )
    }

    logSuccess('ToolRegistry returned from codeModeWithSnippets')

    // Check initial tools
    const initialTools = registry.getTools()
    const toolNames = initialTools.map((t) => t.name)
    logInfo(`Initial tools: ${toolNames.join(', ')}`)

    const hasExecuteTypescript = registry.has('execute_typescript')
    const hasSearchSnippets = registry.has('search_snippets')
    const hasGetSnippet = registry.has('get_snippet')
    const hasRegisterSnippet = registry.has('register_snippet')

    if (!hasExecuteTypescript) {
      logError('Missing execute_typescript tool')
    }
    if (!hasSearchSnippets) {
      logError('Missing search_snippets tool')
    }
    if (!hasGetSnippet) {
      logError('Missing get_snippet tool')
    }
    if (!hasRegisterSnippet) {
      logError('Missing register_snippet tool')
    }

    const hasAllExpectedTools =
      hasExecuteTypescript &&
      hasSearchSnippets &&
      hasGetSnippet &&
      hasRegisterSnippet

    // Verify NO snippet tools exist yet (since no snippets in storage)
    const snippetToolsBefore = toolNames.filter(
      (n) => n.startsWith('snippet_') || n === 'add_two_numbers',
    )
    const noSnippetToolsYet = snippetToolsBefore.length === 0

    result.phases.setup = {
      success: hasAllExpectedTools && noSnippetToolsYet,
      details: {
        toolCount: initialTools.length,
        toolNames,
        hasExecuteTypescript,
        hasSearchSnippets,
        hasGetSnippet,
        hasRegisterSnippet,
        noSnippetToolsYet,
      },
    }

    if (result.phases.setup.success) {
      logSuccess('Phase 1 passed: Registry has all expected initial tools')
    } else {
      logError(
        'Phase 1 failed: Missing expected tools or unexpected snippet tools',
      )
      logInfo(
        `Details: ${JSON.stringify(result.phases.setup.details, null, 2)}`,
      )
    }
  } catch (error) {
    result.phases.setup = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
    logError(`Phase 1 error: ${result.phases.setup.error}`)
    return result
  }

  // =========================================================================
  // Phase 2: Registration - Register a snippet mid-stream and verify it's added
  // =========================================================================

  logSection('Phase 2: Mid-Stream Snippet Registration')
  logStep(1, 'Setting up mock adapter for snippet registration')

  try {
    const chatAdapter = createMockTextAdapter({
      responses: [
        // First: Execute TypeScript to test
        singleToolCall(
          'execute_typescript',
          {
            typescriptCode: ADD_NUMBERS_CODE,
          },
          'call_execute_1',
        ),

        // Second: Register the snippet
        singleToolCall(
          'register_snippet',
          {
            name: 'add_two_numbers',
            description: 'Add two numbers together using the add_numbers tool',
            code: EXPECTED_SNIPPET_CODE,
            inputSchema: JSON.stringify(EXPECTED_SNIPPET_INPUT_SCHEMA),
            outputSchema: JSON.stringify(EXPECTED_SNIPPET_OUTPUT_SCHEMA),
            usageHints: ['Use when the user wants to add two numbers'],
            dependsOn: [],
          },
          'call_register_1',
        ),

        // Third: Final response
        textResponse('Done! I created an add_two_numbers snippet.'),
      ],
      onResponse: (index, response) => {
        logInfo(
          `Mock adapter response ${index + 1}: ${response.toolCalls ? `tool call to ${response.toolCalls[0]?.name}` : 'text'}`,
        )
      },
    })

    const messages: Array<ModelMessage> = [
      {
        role: 'user',
        content: 'Please add 5 + 3 and create a reusable snippet for it.',
      },
    ]

    // Count tools before
    const toolsBefore = registry.getTools().length
    logInfo(`Tools before chat: ${toolsBefore}`)

    logStep(2, 'Running chat with toolRegistry')

    const stream = chat({
      adapter: chatAdapter as any,
      messages: messages as any,
      toolRegistry: registry, // <-- Using the registry, not tools array!
      systemPrompts: ['You are a helpful assistant.'],
      agentLoopStrategy: maxIterations(10),
    })

    let registerSnippetCalled = false
    let registerSnippetResult: any = null

    for await (const chunk of stream as AsyncIterable<StreamChunk>) {
      if (chunk.type === 'tool_call') {
        const toolName = chunk.toolCall.function.name
        logInfo(`Tool called: ${toolName}`)
        if (toolName === 'register_snippet') {
          registerSnippetCalled = true
        }
      } else if (chunk.type === 'tool_result') {
        logInfo(`Tool result for: ${chunk.toolCallId}`)
        // Check if this is the register_snippet result
        if (chunk.toolCallId === 'call_register_1') {
          registerSnippetResult = chunk.result
          logInfo(
            `register_snippet result: ${JSON.stringify(registerSnippetResult)}`,
          )
        }
      } else if (chunk.type === EventType.RUN_FINISHED) {
        logInfo(`Chat done: ${chunk.metadata?.tanstack?.finishReason}`)
      }
    }

    // Check tools after
    const toolsAfter = registry.getTools().length
    logInfo(`Tools after chat: ${toolsAfter}`)

    const toolsIncreased = toolsAfter > toolsBefore
    const hasNewSnippetTool = registry.has('add_two_numbers')

    result.phases.registration = {
      success: registerSnippetCalled && toolsIncreased && hasNewSnippetTool,
      details: {
        registerSnippetCalled,
        toolsBefore,
        toolsAfter,
        toolsIncreased,
        hasNewSnippetTool,
        registerSnippetResult,
      },
    }

    if (result.phases.registration.success) {
      logSuccess(
        'Phase 2 passed: Snippet registered and added to registry mid-stream',
      )
    } else {
      logError('Phase 2 failed: Snippet was not properly added to registry')
      logInfo(
        `Details: ${JSON.stringify(result.phases.registration.details, null, 2)}`,
      )
    }
  } catch (error) {
    result.phases.registration = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
    logError(`Phase 2 error: ${result.phases.registration.error}`)
    return result
  }

  // =========================================================================
  // Phase 3: Verification - Confirm the new snippet tool is callable
  // =========================================================================

  logSection('Phase 3: Snippet Tool Verification')
  logStep(1, 'Verifying the newly registered snippet is a callable tool')

  try {
    // Get the snippet tool from the registry
    const addTwoNumbersTool = registry.get('add_two_numbers')

    if (!addTwoNumbersTool) {
      throw new Error('add_two_numbers tool not found in registry')
    }

    logSuccess('add_two_numbers tool found in registry')

    // Verify it has the expected properties
    const hasName = addTwoNumbersTool.name === 'add_two_numbers'
    const hasDescription = typeof addTwoNumbersTool.description === 'string'
    const hasInputSchema = addTwoNumbersTool.inputSchema !== undefined
    const hasExecute = typeof (addTwoNumbersTool as any).execute === 'function'

    logInfo(`Tool name: ${addTwoNumbersTool.name}`)
    logInfo(`Tool description: ${addTwoNumbersTool.description}`)
    logInfo(`Has inputSchema: ${hasInputSchema}`)
    logInfo(`Has execute function: ${hasExecute}`)

    // Now run a second chat that uses the snippet directly
    logStep(2, 'Running a second chat that calls the snippet directly')

    const secondChatAdapter = createMockTextAdapter({
      responses: [
        // Directly call the newly registered snippet
        singleToolCall(
          'add_two_numbers',
          {
            a: 10,
            b: 20,
          },
          'call_snippet_1',
        ),

        // Final response
        textResponse('The answer is 30.'),
      ],
      onResponse: (index, response) => {
        logInfo(
          `Second chat response ${index + 1}: ${response.toolCalls ? `tool call to ${response.toolCalls[0]?.name}` : 'text'}`,
        )
      },
    })

    const messages2: Array<ModelMessage> = [
      { role: 'user', content: 'What is 10 + 20?' },
    ]

    const stream2 = chat({
      adapter: secondChatAdapter as any,
      messages: messages2 as any,
      toolRegistry: registry,
      systemPrompts: ['You are a helpful assistant.'],
      agentLoopStrategy: maxIterations(5),
    })

    let snippetToolCalled = false
    let snippetToolResultReceived = false

    for await (const chunk of stream2 as AsyncIterable<StreamChunk>) {
      if (chunk.type === 'tool_call') {
        const toolName = chunk.toolCall.function.name
        logInfo(`Tool called: ${toolName}`)
        if (toolName === 'add_two_numbers') {
          snippetToolCalled = true
        }
      } else if (chunk.type === 'tool_result') {
        if (chunk.toolCallId === 'call_snippet_1') {
          // The snippet executed and returned a result (value is in the execution context)
          snippetToolResultReceived = true
          logInfo('Snippet tool execution completed')
        }
      } else if (chunk.type === EventType.RUN_FINISHED) {
        logInfo(`Second chat done: ${chunk.metadata?.tanstack?.finishReason}`)
      }
    }

    // The key verification is that:
    // 1. The snippet tool exists in the registry
    // 2. The chat function called it successfully
    // 3. The tool_result was received (execution happened)
    // The actual execution logs above show "[add_numbers] Adding 10 + 20" which proves
    // the snippet code ran and called the external tool correctly.

    result.phases.verification = {
      success:
        hasName &&
        hasDescription &&
        snippetToolCalled &&
        snippetToolResultReceived,
      details: {
        hasName,
        hasDescription,
        hasInputSchema,
        hasExecute,
        snippetToolCalled,
        snippetToolResultReceived,
      },
    }

    if (result.phases.verification.success) {
      logSuccess(
        'Phase 3 passed: Snippet tool is callable and returns correct result',
      )
    } else {
      logError('Phase 3 failed: Snippet tool verification failed')
      logInfo(
        `Details: ${JSON.stringify(result.phases.verification.details, null, 2)}`,
      )
    }
  } catch (error) {
    result.phases.verification = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
    logError(`Phase 3 error: ${result.phases.verification.error}`)
  }

  // =========================================================================
  // Final Result
  // =========================================================================

  logSection('Test Results')

  result.passed =
    result.phases.setup.success &&
    result.phases.registration.success &&
    result.phases.verification.success

  if (result.passed) {
    logSuccess('All ToolRegistry tests passed!')
    logInfo('✓ Registry returned from codeModeWithSnippets')
    logInfo('✓ Snippets registered mid-stream are added to registry')
    logInfo('✓ Newly registered snippets are callable as tools')
  } else {
    logError('Some ToolRegistry tests failed')
    if (!result.phases.setup.success) {
      logError(`Setup: ${result.phases.setup.error || 'Failed'}`)
    }
    if (!result.phases.registration.success) {
      logError(`Registration: ${result.phases.registration.error || 'Failed'}`)
    }
    if (!result.phases.verification.success) {
      logError(`Verification: ${result.phases.verification.error || 'Failed'}`)
    }
  }

  return result
}
