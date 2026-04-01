/**
 * Simulated test for the skills system
 *
 * Uses a mock adapter with predetermined responses to test:
 * 1. First run: Create a skill using code mode
 * 2. Second run: Use the saved skill
 */

import { chat, maxIterations } from '@tanstack/ai'
import { createNodeIsolateDriver } from '@tanstack/ai-isolate-node'
import { codeModeWithSkills } from '../src/code-mode-with-skills'
import {
  createMockTextAdapter,
  singleToolCall,
  textResponse,
} from './mock-adapter'
import {
  EXPECTED_SKILL_CODE,
  EXPECTED_SKILL_INPUT_SCHEMA,
  EXPECTED_SKILL_OUTPUT_SCHEMA,
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
 * Create a mock adapter specifically for skill selection
 * Returns JSON arrays of skill names based on the skill index
 */
function createSkillSelectionAdapter(skillNames: Array<string>) {
  return createMockTextAdapter({
    responses: [
      // Always return the skill names as JSON array
      textResponse(JSON.stringify(skillNames)),
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
  logSection('Simulated Skills Test')
  logInfo('Testing skill creation and reuse with mock adapter')

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
    skillCreated: false,
    skillUsed: false,
  }

  // =========================================================================
  // Phase 1: First run - Create skill using code mode
  // =========================================================================

  logSection('Phase 1: Skill Creation')
  logStep(1, 'Setting up mock adapter with skill creation responses')

  // Mock adapter for skill selection in Phase 1 (no skills exist yet)
  const phase1SelectionAdapter = createSkillSelectionAdapter([])

  // Mock responses for Phase 1 main chat:
  // 1. First, use execute_typescript to solve the problem
  // 2. Then, register the skill for future use
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

      // Response 2: Register the skill
      singleToolCall(
        'register_skill',
        {
          name: 'add_two_numbers',
          description: 'Add two numbers together using the add_numbers tool',
          code: EXPECTED_SKILL_CODE,
          inputSchema: JSON.stringify(EXPECTED_SKILL_INPUT_SCHEMA),
          outputSchema: JSON.stringify(EXPECTED_SKILL_OUTPUT_SCHEMA),
          usageHints: ['Use when the user wants to add two numbers'],
          dependsOn: [],
        },
        'call_register_1',
      ),

      // Response 3: Final answer
      textResponse(
        'The answer is 8. I have also saved this as a skill called "add_two_numbers" for future use.',
      ),
    ],
    onResponse: (index, response) => {
      logInfo(
        `Mock adapter returning response ${index + 1}: ${response.toolCalls ? `tool call to ${response.toolCalls[0]?.name}` : 'text response'}`,
      )
    },
  })

  try {
    logStep(2, 'Running code mode with skills (first run, no existing skills)')

    const messages1: Array<ModelMessage> = [
      {
        role: 'user',
        content:
          'What is 5 + 3? Please create a skill for adding numbers after solving this.',
      },
    ]

    // Get registry and system prompt with skills integration
    // Note: We use the selection adapter for skill selection, then the chat adapter for the actual chat
    const { toolsRegistry: registry1, systemPrompt: systemPrompt1 } =
      await codeModeWithSkills({
        config: {
          driver,
          tools: [addNumbersTool],
          timeout: 30000,
          memoryLimit: 128,
        },
        adapter: phase1SelectionAdapter, // Used for skill selection (returns [])
        skills: {
          storage,
          maxSkillsInContext: 5,
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
    let registerSkillCalled = false

    for await (const chunk of stream1 as AsyncIterable<StreamChunk>) {
      if (chunk.type === 'tool_call') {
        toolCallCount1++
        const toolName = chunk.toolCall.function.name
        logInfo(`Tool called: ${toolName}`)
        if (toolName === 'execute_typescript') {
          executeTypescriptCalled = true
        }
        if (toolName === 'register_skill') {
          registerSkillCalled = true
        }
      } else if (chunk.type === 'tool_result') {
        logInfo(`Tool result received for: ${chunk.toolCallId}`)
      } else if (chunk.type === 'content') {
        // Content streaming
      } else if (chunk.type === 'done') {
        logInfo(`Phase 1 done: ${chunk.finishReason}`)
      }
    }

    // Verify skill was created
    const skillIndex = await storage.loadIndex()
    const skillCreated = skillIndex.some((s) => s.name === 'add_two_numbers')

    if (skillCreated) {
      result.skillCreated = true
      logSuccess('Skill "add_two_numbers" was created successfully')
    } else {
      logError('Skill was not created')
    }

    result.phases.phase1 = {
      success: executeTypescriptCalled && registerSkillCalled && skillCreated,
      details: {
        toolCallCount: toolCallCount1,
        executeTypescriptCalled,
        registerSkillCalled,
        skillCreated,
        skillsInStorage: skillIndex.length,
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
  // Phase 2: Second run - Use the saved skill
  // =========================================================================

  logSection('Phase 2: Skill Reuse')
  logStep(1, 'Setting up mock adapter with skill usage responses')

  // Mock adapter for skill selection in Phase 2 - returns the skill we created
  const phase2SelectionAdapter = createSkillSelectionAdapter([
    'add_two_numbers',
  ])

  // Mock responses for Phase 2 main chat:
  // 1. Call the add_two_numbers skill directly (not execute_typescript)
  // 2. Provide the final answer
  const phase2ChatAdapter = createMockTextAdapter({
    responses: [
      // Response 1: Call the skill directly
      singleToolCall(
        'add_two_numbers',
        {
          a: 10,
          b: 20,
        },
        'call_skill_1',
      ),

      // Response 2: Final answer
      textResponse(
        'The answer is 30. I used the add_two_numbers skill to calculate this.',
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
      'Running code mode with skills (second run, skill should be available)',
    )

    const messages2: Array<ModelMessage> = [
      { role: 'user', content: 'What is 10 + 20?' },
    ]

    // Get registry and system prompt with skills integration
    // Note: We use the selection adapter for skill selection (returns ['add_two_numbers'])
    const {
      registry: registry2,
      systemPrompt: systemPrompt2,
      selectedSkills,
    } = await codeModeWithSkills({
      config: {
        driver,
        tools: [addNumbersTool],
        timeout: 30000,
        memoryLimit: 128,
      },
      adapter: phase2SelectionAdapter, // Used for skill selection (returns ['add_two_numbers'])
      skills: {
        storage,
        maxSkillsInContext: 5,
      },
      messages: messages2,
    })

    const tools2 = registry2.getTools()
    logInfo(
      `Phase 2 tools available: ${tools2.map((t: any) => t.name).join(', ')}`,
    )
    logInfo(
      `Selected skills: ${selectedSkills.map((s) => s.name).join(', ') || 'none'}`,
    )
    logInfo(`System prompt length: ${systemPrompt2.length} chars`)

    // Check if skill is now available as a tool
    const skillToolAvailable = registry2.has('add_two_numbers')
    if (skillToolAvailable) {
      logSuccess('Skill "add_two_numbers" is now available as a tool')
    } else {
      logWarning(
        'Skill is not available as a tool (may not have been selected)',
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
    let skillCalled = false
    let executeTypescriptCalledPhase2 = false

    for await (const chunk of stream2 as AsyncIterable<StreamChunk>) {
      if (chunk.type === 'tool_call') {
        toolCallCount2++
        const toolName = chunk.toolCall.function.name
        logInfo(`Tool called: ${toolName}`)
        if (toolName === 'add_two_numbers') {
          skillCalled = true
        }
        if (toolName === 'execute_typescript') {
          executeTypescriptCalledPhase2 = true
        }
      } else if (chunk.type === 'tool_result') {
        logInfo(`Tool result received for: ${chunk.toolCallId}`)
      } else if (chunk.type === 'done') {
        logInfo(`Phase 2 done: ${chunk.finishReason}`)
      }
    }

    result.skillUsed = skillCalled && !executeTypescriptCalledPhase2

    result.phases.phase2 = {
      success: skillCalled,
      details: {
        toolCallCount: toolCallCount2,
        skillCalled,
        executeTypescriptCalled: executeTypescriptCalledPhase2,
        skillToolAvailable,
        selectedSkillCount: selectedSkills.length,
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
    logInfo(`✓ Skill created: ${result.skillCreated}`)
    logInfo(`✓ Skill used: ${result.skillUsed}`)
  } else {
    logError('Some tests failed')
    if (!result.phases.phase1.success) {
      logError(
        `Phase 1 (Skill Creation): ${result.phases.phase1.error || 'Failed'}`,
      )
    }
    if (!result.phases.phase2.success) {
      logError(
        `Phase 2 (Skill Reuse): ${result.phases.phase2.error || 'Failed'}`,
      )
    }
  }

  return result
}

// Allow running directly
function logWarning(message: string) {
  console.log(`\x1b[33m⚠️  ${message}\x1b[0m`)
}
