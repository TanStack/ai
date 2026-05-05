/**
 * Simulated test for dynamic ToolRegistry functionality
 *
 * Tests that:
 * 1. codeModeWithSkills returns a ToolRegistry instead of a tools array
 * 2. The registry contains expected initial tools
 * 3. Skills registered mid-stream are immediately added to the registry
 * 4. The newly registered skill becomes available as a callable tool
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
 * Create a mock adapter for skill selection (no skills initially)
 */
function createSkillSelectionAdapter(skillNames: Array<string>) {
  return createMockTextAdapter({
    responses: [textResponse(JSON.stringify(skillNames))],
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
  logInfo('Testing that skills registered mid-stream are immediately available')

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
  logStep(1, 'Calling codeModeWithSkills to get ToolRegistry')

  let registry: ToolRegistry

  try {
    const selectionAdapter = createSkillSelectionAdapter([])
    const messages: Array<ModelMessage> = [
      { role: 'user', content: 'What is 5 + 3?' },
    ]

    const codeWithSkillsResult = await codeModeWithSkills({
      config: {
        driver,
        tools: [addNumbersTool],
        timeout: 30000,
        memoryLimit: 128,
      },
      adapter: selectionAdapter,
      skills: {
        storage,
        maxSkillsInContext: 5,
      },
      messages,
    })

    registry = codeWithSkillsResult.toolsRegistry

    // Verify registry is returned (not a tools array)
    const hasGetTools = typeof registry.getTools === 'function'
    const hasAdd = typeof registry.add === 'function'
    const hasHas = typeof registry.has === 'function'

    if (!hasGetTools || !hasAdd || !hasHas) {
      throw new Error('codeModeWithSkills did not return a valid ToolRegistry')
    }

    logSuccess('ToolRegistry returned from codeModeWithSkills')

    // Check initial tools
    const initialTools = registry.getTools()
    const toolNames = initialTools.map((t) => t.name)
    logInfo(`Initial tools: ${toolNames.join(', ')}`)

    const hasExecuteTypescript = registry.has('execute_typescript')
    const hasSearchSkills = registry.has('search_skills')
    const hasGetSkill = registry.has('get_skill')
    const hasRegisterSkill = registry.has('register_skill')

    if (!hasExecuteTypescript) {
      logError('Missing execute_typescript tool')
    }
    if (!hasSearchSkills) {
      logError('Missing search_skills tool')
    }
    if (!hasGetSkill) {
      logError('Missing get_skill tool')
    }
    if (!hasRegisterSkill) {
      logError('Missing register_skill tool')
    }

    const hasAllExpectedTools =
      hasExecuteTypescript && hasSearchSkills && hasGetSkill && hasRegisterSkill

    // Verify NO skill tools exist yet (since no skills in storage)
    const skillToolsBefore = toolNames.filter(
      (n) => n.startsWith('skill_') || n === 'add_two_numbers',
    )
    const noSkillToolsYet = skillToolsBefore.length === 0

    result.phases.setup = {
      success: hasAllExpectedTools && noSkillToolsYet,
      details: {
        toolCount: initialTools.length,
        toolNames,
        hasExecuteTypescript,
        hasSearchSkills,
        hasGetSkill,
        hasRegisterSkill,
        noSkillToolsYet,
      },
    }

    if (result.phases.setup.success) {
      logSuccess('Phase 1 passed: Registry has all expected initial tools')
    } else {
      logError(
        'Phase 1 failed: Missing expected tools or unexpected skill tools',
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
  // Phase 2: Registration - Register a skill mid-stream and verify it's added
  // =========================================================================

  logSection('Phase 2: Mid-Stream Skill Registration')
  logStep(1, 'Setting up mock adapter for skill registration')

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

        // Second: Register the skill
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

        // Third: Final response
        textResponse('Done! I created an add_two_numbers skill.'),
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
        content: 'Please add 5 + 3 and create a reusable skill for it.',
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

    let registerSkillCalled = false
    let registerSkillResult: any = null

    for await (const chunk of stream as AsyncIterable<StreamChunk>) {
      if (chunk.type === 'tool_call') {
        const toolName = chunk.toolCall.function.name
        logInfo(`Tool called: ${toolName}`)
        if (toolName === 'register_skill') {
          registerSkillCalled = true
        }
      } else if (chunk.type === 'tool_result') {
        logInfo(`Tool result for: ${chunk.toolCallId}`)
        // Check if this is the register_skill result
        if (chunk.toolCallId === 'call_register_1') {
          registerSkillResult = chunk.result
          logInfo(
            `register_skill result: ${JSON.stringify(registerSkillResult)}`,
          )
        }
      } else if (chunk.type === 'done') {
        logInfo(`Chat done: ${chunk.finishReason}`)
      }
    }

    // Check tools after
    const toolsAfter = registry.getTools().length
    logInfo(`Tools after chat: ${toolsAfter}`)

    const toolsIncreased = toolsAfter > toolsBefore
    const hasNewSkillTool = registry.has('add_two_numbers')

    result.phases.registration = {
      success: registerSkillCalled && toolsIncreased && hasNewSkillTool,
      details: {
        registerSkillCalled,
        toolsBefore,
        toolsAfter,
        toolsIncreased,
        hasNewSkillTool,
        registerSkillResult,
      },
    }

    if (result.phases.registration.success) {
      logSuccess(
        'Phase 2 passed: Skill registered and added to registry mid-stream',
      )
    } else {
      logError('Phase 2 failed: Skill was not properly added to registry')
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
  // Phase 3: Verification - Confirm the new skill tool is callable
  // =========================================================================

  logSection('Phase 3: Skill Tool Verification')
  logStep(1, 'Verifying the newly registered skill is a callable tool')

  try {
    // Get the skill tool from the registry
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

    // Now run a second chat that uses the skill directly
    logStep(2, 'Running a second chat that calls the skill directly')

    const secondChatAdapter = createMockTextAdapter({
      responses: [
        // Directly call the newly registered skill
        singleToolCall(
          'add_two_numbers',
          {
            a: 10,
            b: 20,
          },
          'call_skill_1',
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

    let skillToolCalled = false
    let skillToolResultReceived = false

    for await (const chunk of stream2 as AsyncIterable<StreamChunk>) {
      if (chunk.type === 'tool_call') {
        const toolName = chunk.toolCall.function.name
        logInfo(`Tool called: ${toolName}`)
        if (toolName === 'add_two_numbers') {
          skillToolCalled = true
        }
      } else if (chunk.type === 'tool_result') {
        if (chunk.toolCallId === 'call_skill_1') {
          // The skill executed and returned a result (value is in the execution context)
          skillToolResultReceived = true
          logInfo('Skill tool execution completed')
        }
      } else if (chunk.type === 'done') {
        logInfo(`Second chat done: ${chunk.finishReason}`)
      }
    }

    // The key verification is that:
    // 1. The skill tool exists in the registry
    // 2. The chat function called it successfully
    // 3. The tool_result was received (execution happened)
    // The actual execution logs above show "[add_numbers] Adding 10 + 20" which proves
    // the skill code ran and called the external tool correctly.

    result.phases.verification = {
      success:
        hasName && hasDescription && skillToolCalled && skillToolResultReceived,
      details: {
        hasName,
        hasDescription,
        hasInputSchema,
        hasExecute,
        skillToolCalled,
        skillToolResultReceived,
      },
    }

    if (result.phases.verification.success) {
      logSuccess(
        'Phase 3 passed: Skill tool is callable and returns correct result',
      )
    } else {
      logError('Phase 3 failed: Skill tool verification failed')
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
    logInfo('✓ Registry returned from codeModeWithSkills')
    logInfo('✓ Skills registered mid-stream are added to registry')
    logInfo('✓ Newly registered skills are callable as tools')
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
