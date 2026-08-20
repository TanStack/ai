/**
 * Simulated test for the snippets system
 *
 * Uses a mock adapter with predetermined responses to test:
 * 1. First run: Create a snippet using code mode
 * 2. Second run: Use the saved snippet
 */

import { EventType, chat, maxIterations, tanstackMetadata } from '@tanstack/ai'
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
import type { TestResult } from './test-utils'

/**
 * Create a mock adapter specifically for snippet selection
 * Returns JSON arrays of snippet names based on the snippet index
 */
function createSnippetSelectionAdapter(snippetNames: Array<string>) {
  return createMockTextAdapter({
    responses: [
      // Always return the snippet names as JSON array
      textResponse(JSON.stringify(snippetNames)),
    ],
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
 * Run the simulated test
 */
export async function runSimulatedTest(): Promise<TestResult> {
  logSection('Simulated Snippets Test')
  logInfo('Testing snippet creation and reuse with mock adapter')

  // Create shared storage that persists between phases
  const storage = createTestStorage()
  const driver = createNodeIsolateDriver({
    memoryLimit: 128,
    timeout: 30000,
  })

  const result: TestResult = {
    passed: false,
    phases: {
      phase1: { success: false },
      phase2: { success: false },
    },
    snippetCreated: false,
    snippetUsed: false,
  }

  // =========================================================================
  // Phase 1: First run - Create snippet using code mode
  // =========================================================================

  logSection('Phase 1: Snippet Creation')
  logStep(1, 'Setting up mock adapter with snippet creation responses')

  // Mock adapter for snippet selection in Phase 1 (no snippets exist yet)
  const phase1SelectionAdapter = createSnippetSelectionAdapter([])

  // Mock responses for Phase 1 main chat:
  // 1. First, use execute_typescript to solve the problem
  // 2. Then, register the snippet for future use
  // 3. Finally, provide the answer
  const phase1ChatAdapter = createMockTextAdapter({
    responses: [
      // Response 1: Execute TypeScript to add numbers
      singleToolCall(
        'execute_typescript',
        {
          typescriptCode: ADD_NUMBERS_CODE,
        },
        'call_execute_1',
      ),

      // Response 2: Register the snippet
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

      // Response 3: Final answer
      textResponse(
        'The answer is 8. I have also saved this as a snippet called "add_two_numbers" for future use.',
      ),
    ],
    onResponse: (index, response) => {
      logInfo(
        `Mock adapter returning response ${index + 1}: ${response.toolCalls ? `tool call to ${response.toolCalls[0]?.name}` : 'text response'}`,
      )
    },
  })

  try {
    logStep(
      2,
      'Running code mode with snippets (first run, no existing snippets)',
    )

    const messages1: Array<ModelMessage> = [
      {
        role: 'user',
        content:
          'What is 5 + 3? Please create a snippet for adding numbers after solving this.',
      },
    ]

    // Get registry and system prompt with snippets integration
    // Note: We use the selection adapter for snippet selection, then the chat adapter for the actual chat
    const { toolsRegistry: registry1, systemPrompt: systemPrompt1 } =
      await codeModeWithSnippets({
        config: {
          driver,
          tools: [addNumbersTool],
          timeout: 30000,
          memoryLimit: 128,
        },
        adapter: phase1SelectionAdapter, // Used for snippet selection (returns [])
        snippets: {
          storage,
          maxSnippetsInContext: 5,
        },
        messages: messages1,
      })

    const tools1 = registry1.getTools()
    logInfo(
      `Phase 1 tools available: ${tools1.map((t: any) => t.name).join(', ')}`,
    )
    logInfo(`System prompt length: ${systemPrompt1.length} chars`)

    // Run the chat
    logStep(3, 'Executing chat with mock adapter')

    const stream1 = chat({
      adapter: phase1ChatAdapter as any,
      messages: messages1 as any,
      toolRegistry: registry1, // Use the registry instead of tools array
      systemPrompts: [systemPrompt1],
      agentLoopStrategy: maxIterations(10),
    })

    let toolCallCount1 = 0
    let executeTypescriptCalled = false
    let registerSnippetCalled = false

    for await (const chunk of stream1 as AsyncIterable<StreamChunk>) {
      if (chunk.type === 'tool_call') {
        toolCallCount1++
        const toolName = chunk.toolCall.function.name
        logInfo(`Tool called: ${toolName}`)
        if (toolName === 'execute_typescript') {
          executeTypescriptCalled = true
        }
        if (toolName === 'register_snippet') {
          registerSnippetCalled = true
        }
      } else if (chunk.type === 'tool_result') {
        logInfo(`Tool result received for: ${chunk.toolCallId}`)
      } else if (chunk.type === 'content') {
        // Content streaming
      } else if (chunk.type === EventType.RUN_FINISHED) {
        logInfo(`Phase 1 done: ${tanstackMetadata(chunk)?.finishReason}`)
      }
    }

    // Verify snippet was created
    const snippetIndex = await storage.loadIndex()
    const snippetCreated = snippetIndex.some(
      (s) => s.name === 'add_two_numbers',
    )

    if (snippetCreated) {
      result.snippetCreated = true
      logSuccess('Snippet "add_two_numbers" was created successfully')
    } else {
      logError('Snippet was not created')
    }

    result.phases.phase1 = {
      success:
        executeTypescriptCalled && registerSnippetCalled && snippetCreated,
      details: {
        toolCallCount: toolCallCount1,
        executeTypescriptCalled,
        registerSnippetCalled,
        snippetCreated,
        snippetsInStorage: snippetIndex.length,
      },
    }

    if (result.phases.phase1.success) {
      logSuccess('Phase 1 completed successfully')
    } else {
      logError('Phase 1 failed')
      logInfo(
        `Details: ${JSON.stringify(result.phases.phase1.details, null, 2)}`,
      )
    }
  } catch (error) {
    result.phases.phase1 = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
    logError(`Phase 1 error: ${result.phases.phase1.error}`)
  }

  // =========================================================================
  // Phase 2: Second run - Use the saved snippet
  // =========================================================================

  logSection('Phase 2: Snippet Reuse')
  logStep(1, 'Setting up mock adapter with snippet usage responses')

  // Mock adapter for snippet selection in Phase 2 - returns the snippet we created
  const phase2SelectionAdapter = createSnippetSelectionAdapter([
    'add_two_numbers',
  ])

  // Mock responses for Phase 2 main chat:
  // 1. Call the add_two_numbers snippet directly (not execute_typescript)
  // 2. Provide the final answer
  const phase2ChatAdapter = createMockTextAdapter({
    responses: [
      // Response 1: Call the snippet directly
      singleToolCall(
        'add_two_numbers',
        {
          a: 10,
          b: 20,
        },
        'call_snippet_1',
      ),

      // Response 2: Final answer
      textResponse(
        'The answer is 30. I used the add_two_numbers snippet to calculate this.',
      ),
    ],
    onResponse: (index, response) => {
      logInfo(
        `Mock adapter returning response ${index + 1}: ${response.toolCalls ? `tool call to ${response.toolCalls[0]?.name}` : 'text response'}`,
      )
    },
  })

  try {
    logStep(
      2,
      'Running code mode with snippets (second run, snippet should be available)',
    )

    const messages2: Array<ModelMessage> = [
      { role: 'user', content: 'What is 10 + 20?' },
    ]

    // Get registry and system prompt with snippets integration
    // Note: We use the selection adapter for snippet selection (returns ['add_two_numbers'])
    const {
      registry: registry2,
      systemPrompt: systemPrompt2,
      selectedSnippets,
    } = await codeModeWithSnippets({
      config: {
        driver,
        tools: [addNumbersTool],
        timeout: 30000,
        memoryLimit: 128,
      },
      adapter: phase2SelectionAdapter, // Used for snippet selection (returns ['add_two_numbers'])
      snippets: {
        storage,
        maxSnippetsInContext: 5,
      },
      messages: messages2,
    })

    const tools2 = registry2.getTools()
    logInfo(
      `Phase 2 tools available: ${tools2.map((t: any) => t.name).join(', ')}`,
    )
    logInfo(
      `Selected snippets: ${selectedSnippets.map((s) => s.name).join(', ') || 'none'}`,
    )
    logInfo(`System prompt length: ${systemPrompt2.length} chars`)

    // Check if snippet is now available as a tool
    const snippetToolAvailable = registry2.has('add_two_numbers')
    if (snippetToolAvailable) {
      logSuccess('Snippet "add_two_numbers" is now available as a tool')
    } else {
      logWarning(
        'Snippet is not available as a tool (may not have been selected)',
      )
    }

    // Run the chat
    logStep(3, 'Executing chat with mock adapter')

    const stream2 = chat({
      adapter: phase2ChatAdapter as any,
      messages: messages2 as any,
      toolRegistry: registry2, // Use the registry instead of tools array
      systemPrompts: [systemPrompt2],
      agentLoopStrategy: maxIterations(10),
    })

    let toolCallCount2 = 0
    let snippetCalled = false
    let executeTypescriptCalledPhase2 = false

    for await (const chunk of stream2 as AsyncIterable<StreamChunk>) {
      if (chunk.type === 'tool_call') {
        toolCallCount2++
        const toolName = chunk.toolCall.function.name
        logInfo(`Tool called: ${toolName}`)
        if (toolName === 'add_two_numbers') {
          snippetCalled = true
        }
        if (toolName === 'execute_typescript') {
          executeTypescriptCalledPhase2 = true
        }
      } else if (chunk.type === 'tool_result') {
        logInfo(`Tool result received for: ${chunk.toolCallId}`)
      } else if (chunk.type === EventType.RUN_FINISHED) {
        logInfo(`Phase 2 done: ${tanstackMetadata(chunk)?.finishReason}`)
      }
    }

    result.snippetUsed = snippetCalled && !executeTypescriptCalledPhase2

    result.phases.phase2 = {
      success: snippetCalled,
      details: {
        toolCallCount: toolCallCount2,
        snippetCalled,
        executeTypescriptCalled: executeTypescriptCalledPhase2,
        snippetToolAvailable,
        selectedSnippetCount: selectedSnippets.length,
      },
    }

    if (result.phases.phase2.success) {
      logSuccess('Phase 2 completed successfully')
    } else {
      logError('Phase 2 failed')
      logInfo(
        `Details: ${JSON.stringify(result.phases.phase2.details, null, 2)}`,
      )
    }
  } catch (error) {
    result.phases.phase2 = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
    logError(`Phase 2 error: ${result.phases.phase2.error}`)
  }

  // =========================================================================
  // Final Result
  // =========================================================================

  logSection('Test Results')

  result.passed = result.phases.phase1.success && result.phases.phase2.success

  if (result.passed) {
    logSuccess('All tests passed!')
    logInfo(`✓ Snippet created: ${result.snippetCreated}`)
    logInfo(`✓ Snippet used: ${result.snippetUsed}`)
  } else {
    logError('Some tests failed')
    if (!result.phases.phase1.success) {
      logError(
        `Phase 1 (Snippet Creation): ${result.phases.phase1.error || 'Failed'}`,
      )
    }
    if (!result.phases.phase2.success) {
      logError(
        `Phase 2 (Snippet Reuse): ${result.phases.phase2.error || 'Failed'}`,
      )
    }
  }

  return result
}

// Allow running directly
function logWarning(message: string) {
  console.log(`\x1b[33m⚠️  ${message}\x1b[0m`)
}
