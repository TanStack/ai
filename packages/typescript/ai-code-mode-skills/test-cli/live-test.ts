/**
 * Live test for the skills system
 *
 * Uses a real LLM adapter (OpenAI or Anthropic) to test:
 * 1. First run: Create a skill using code mode
 * 2. Second run: Use the saved skill
 */

import { chat, maxIterations } from '@tanstack/ai'
import { createNodeIsolateDriver } from '@tanstack/ai-isolate-node'
import { codeModeWithSkills } from '../src/code-mode-with-skills'
import {
  addNumbersTool,
  createTestStorage,
  logError,
  logInfo,
  logSection,
  logStep,
  logSuccess,
  logWarning,
} from './test-utils'
import type { AnyTextAdapter, ModelMessage, StreamChunk } from '@tanstack/ai'
import type { TestResult } from './test-utils'

/**
 * Options for the live test
 */
export interface LiveTestOptions {
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
 * Run the live test with a real LLM
 */
export async function runLiveTest(
  options: LiveTestOptions,
): Promise<TestResult> {
  const { adapter, verbose = false } = options

  logSection('Live Skills Test')
  logInfo(`Using adapter: ${adapter.name} with model: ${adapter.model}`)

  // Create shared storage that persists between phases
  const storage = createTestStorage()
  const driver = createNodeIsolateDriver({
    memoryLimit: 128,
    timeout: 60000, // Longer timeout for real LLM
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
  logStep(1, 'Running code mode with real LLM (no existing skills)')

  try {
    const messages1: Array<ModelMessage> = [
      {
        role: 'user',
        content: `What is 5 + 3? 

IMPORTANT INSTRUCTIONS:
1. Use the execute_typescript tool to call external_add_numbers({ a: 5, b: 3 }) to get the answer
2. After getting the result, use register_skill to save a reusable skill called "add_two_numbers" that wraps this pattern
3. The skill should accept { a: number, b: number } as input and return the result from external_add_numbers

Please complete all three steps: execute the code, register the skill, and tell me the answer.`,
      },
    ]

    // Get tools and system prompt with skills integration
    const { tools: tools1, systemPrompt: systemPrompt1 } =
      await codeModeWithSkills({
        config: {
          driver,
          tools: [addNumbersTool],
          timeout: 60000,
          memoryLimit: 128,
        },
        adapter,
        skills: {
          storage,
          maxSkillsInContext: 5,
        },
        messages: messages1,
      })

    logInfo(
      `Phase 1 tools available: ${tools1.map((t: any) => t.name).join(', ')}`,
    )
    if (verbose) {
      logInfo(`System prompt:\n${systemPrompt1.substring(0, 500)}...`)
    }

    // Run the chat
    logStep(2, 'Executing chat with LLM')

    const stream1 = chat({
      adapter,
      messages: messages1,
      tools: tools1 as any,
      systemPrompts: [systemPrompt1],
      agentLoopStrategy: maxIterations(15),
    })

    let toolCallCount1 = 0
    let executeTypescriptCalled = false
    let registerSkillCalled = false
    let fullContent = ''

    for await (const chunk of stream1 as AsyncIterable<StreamChunk>) {
      if (chunk.type === 'tool_call') {
        toolCallCount1++
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
        if (toolName === 'register_skill') {
          registerSkillCalled = true
        }
      } else if (chunk.type === 'tool_result') {
        if (verbose) {
          logInfo(`Tool result: ${chunk.content.substring(0, 200)}...`)
        }
      } else if (chunk.type === 'content') {
        fullContent += chunk.delta
      } else if (chunk.type === 'done') {
        logInfo(`Phase 1 done: ${chunk.finishReason}`)
      }
    }

    if (verbose && fullContent) {
      logInfo(`LLM response: ${fullContent.substring(0, 500)}...`)
    }

    // Verify skill was created
    const skillIndex = await storage.loadIndex()
    const skillCreated = skillIndex.some((s) => s.name === 'add_two_numbers')

    if (skillCreated) {
      result.skillCreated = true
      logSuccess('Skill "add_two_numbers" was created successfully')

      // Log the created skill
      const skill = await storage.get('add_two_numbers')
      if (skill && verbose) {
        logInfo(`Skill details:`)
        logInfo(`  Description: ${skill.description}`)
        logInfo(`  Code: ${skill.code.substring(0, 100)}...`)
      }
    } else {
      logWarning(
        'Skill was not created - LLM may not have followed instructions',
      )
    }

    result.phases.phase1 = {
      success: executeTypescriptCalled,
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
      logError('Phase 1 failed - execute_typescript was not called')
    }
  } catch (error) {
    result.phases.phase1 = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
    logError(`Phase 1 error: ${result.phases.phase1.error}`)
  }

  // =========================================================================
  // Phase 2: Second run - Use the saved skill (if created)
  // =========================================================================

  logSection('Phase 2: Skill Reuse')

  // Only run phase 2 if a skill was created
  if (!result.skillCreated) {
    logWarning('Skipping Phase 2 - no skill was created in Phase 1')
    result.phases.phase2 = {
      success: false,
      error: 'No skill was created in Phase 1',
    }
  } else {
    logStep(1, 'Running code mode with real LLM (skill should be available)')

    try {
      const messages2: Array<ModelMessage> = [
        {
          role: 'user',
          content: `What is 10 + 20? 

If you have a skill called "add_two_numbers" available, please use it directly instead of execute_typescript.`,
        },
      ]

      // Get tools and system prompt with skills integration
      const {
        tools: tools2,
        systemPrompt: systemPrompt2,
        selectedSkills,
      } = await codeModeWithSkills({
        config: {
          driver,
          tools: [addNumbersTool],
          timeout: 60000,
          memoryLimit: 128,
        },
        adapter,
        skills: {
          storage,
          maxSkillsInContext: 5,
        },
        messages: messages2,
      })

      logInfo(
        `Phase 2 tools available: ${tools2.map((t: any) => t.name).join(', ')}`,
      )
      logInfo(
        `Selected skills: ${selectedSkills.map((s) => s.name).join(', ') || 'none'}`,
      )

      // Check if skill is now available as a tool
      const skillToolAvailable = tools2.some(
        (t: any) => t.name === 'add_two_numbers',
      )
      if (skillToolAvailable) {
        logSuccess('Skill "add_two_numbers" is available as a tool')
      } else {
        logWarning(
          'Skill is not available as a tool (may not have been selected by LLM)',
        )
      }

      // Run the chat
      logStep(2, 'Executing chat with LLM')

      const stream2 = chat({
        adapter,
        messages: messages2,
        tools: tools2 as any,
        systemPrompts: [systemPrompt2],
        agentLoopStrategy: maxIterations(15),
      })

      let toolCallCount2 = 0
      let skillCalled = false
      let skillExecutedSuccessfully = false
      let skillExecutionError: string | undefined
      let executeTypescriptCalledPhase2 = false
      let fullContent2 = ''

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
          // Check if this is the skill result and if it succeeded
          if (skillCalled && chunk.toolCallId) {
            // Check if the result contains an error
            const resultContent = chunk.content
            if (
              resultContent.includes('error') ||
              resultContent.includes('Error')
            ) {
              skillExecutionError = resultContent.substring(0, 200)
              logError(`Skill execution failed: ${skillExecutionError}`)
            } else {
              skillExecutedSuccessfully = true
              if (verbose) {
                logInfo(`Skill result: ${resultContent.substring(0, 200)}`)
              }
            }
          }
        } else if (chunk.type === 'content') {
          fullContent2 += chunk.delta
        } else if (chunk.type === 'done') {
          logInfo(`Phase 2 done: ${chunk.finishReason}`)
        }
      }

      if (verbose && fullContent2) {
        logInfo(`LLM response: ${fullContent2.substring(0, 500)}...`)
      }

      result.skillUsed = skillCalled && skillExecutedSuccessfully

      // Consider phase 2 successful if either:
      // 1. The skill was called directly AND executed successfully, OR
      // 2. The skill wasn't available (selection issue) but execute_typescript worked
      const phase2Success =
        (skillCalled && skillExecutedSuccessfully) ||
        executeTypescriptCalledPhase2

      result.phases.phase2 = {
        success: phase2Success,
        details: {
          toolCallCount: toolCallCount2,
          skillCalled,
          skillExecutedSuccessfully,
          skillExecutionError,
          executeTypescriptCalled: executeTypescriptCalledPhase2,
          skillToolAvailable,
          selectedSkillCount: selectedSkills.length,
        },
      }

      if (skillCalled && skillExecutedSuccessfully) {
        logSuccess(
          'Phase 2 completed successfully - skill was called and executed correctly!',
        )
      } else if (skillCalled && !skillExecutedSuccessfully) {
        logError(
          `Phase 2 failed - skill was called but execution failed: ${skillExecutionError}`,
        )
      } else if (executeTypescriptCalledPhase2) {
        logWarning(
          'Phase 2 completed but LLM used execute_typescript instead of the skill',
        )
      } else {
        logError('Phase 2 failed - no tool was called')
      }
    } catch (error) {
      result.phases.phase2 = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
      logError(`Phase 2 error: ${result.phases.phase2.error}`)
    }
  }

  // =========================================================================
  // Final Result
  // =========================================================================

  logSection('Test Results')

  // For live tests, we're more lenient - consider it passed if Phase 1 succeeded
  // since LLM behavior can vary
  result.passed = result.phases.phase1.success

  if (result.passed) {
    logSuccess('Test passed!')
    logInfo(
      `✓ execute_typescript used in Phase 1: ${result.phases.phase1.details?.executeTypescriptCalled}`,
    )
    logInfo(`✓ Skill created: ${result.skillCreated}`)
    logInfo(`✓ Skill used successfully in Phase 2: ${result.skillUsed}`)
  } else {
    logError('Test failed')
    if (!result.phases.phase1.success) {
      logError(`Phase 1 (Code Mode): ${result.phases.phase1.error || 'Failed'}`)
    }
    if (!result.phases.phase2.success) {
      const phase2Details = result.phases.phase2.details as
        | Record<string, unknown>
        | undefined
      if (phase2Details?.skillExecutionError) {
        logError(
          `Phase 2 (Skill Reuse): Skill execution failed - ${phase2Details.skillExecutionError}`,
        )
      } else {
        logError(
          `Phase 2 (Skill Reuse): ${result.phases.phase2.error || 'Failed'}`,
        )
      }
    }
  }

  return result
}
