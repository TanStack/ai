import type { ToolExecutionContext } from '@tanstack/ai'
import type { ToolBinding } from '@tanstack/ai-code-mode'
import type { Skill, SkillStorage } from './types'

interface SkillsToBindingsOptions {
  /**
   * Skills to convert to bindings
   */
  skills: Array<Skill>

  /**
   * Tool execution context for emitting custom events
   */
  context?: ToolExecutionContext

  /**
   * Function to execute skill code in the sandbox
   * The skill code receives `input` as a variable
   */
  executeInSandbox: (code: string, input: unknown) => Promise<unknown>

  /**
   * Storage for updating execution stats
   */
  storage: SkillStorage
}

/**
 * Convert skills to sandbox bindings with the skill_ prefix.
 * Skills become callable functions inside the sandbox.
 */
export function skillsToBindings({
  skills,
  context,
  executeInSandbox,
  storage,
}: SkillsToBindingsOptions): Record<string, ToolBinding> {
  const bindings: Record<string, ToolBinding> = {}

  for (const skill of skills) {
    const bindingName = `skill_${skill.name}`

    bindings[bindingName] = {
      name: bindingName,
      description: skill.description,
      inputSchema: skill.inputSchema,
      outputSchema: skill.outputSchema,
      execute: async (input: unknown) => {
        const startTime = Date.now()

        // Emit skill call event
        context?.emitCustomEvent('code_mode:skill_call', {
          skill: skill.name,
          input,
          timestamp: startTime,
        })

        try {
          // Wrap the skill code to receive input as a variable
          const wrappedCode = `
            const input = ${JSON.stringify(input)};
            ${skill.code}
          `

          const result = await executeInSandbox(wrappedCode, input)
          const duration = Date.now() - startTime

          // Emit success event
          context?.emitCustomEvent('code_mode:skill_result', {
            skill: skill.name,
            result,
            duration,
            timestamp: Date.now(),
          })

          // Update stats (async, don't await to not block)
          storage.updateStats(skill.name, true).catch(() => {
            // Silently ignore stats update failures
          })

          return result
        } catch (error) {
          const duration = Date.now() - startTime

          // Emit error event
          context?.emitCustomEvent('code_mode:skill_error', {
            skill: skill.name,
            error: error instanceof Error ? error.message : String(error),
            duration,
            timestamp: Date.now(),
          })

          // Update stats (async, don't await)
          storage.updateStats(skill.name, false).catch(() => {
            // Silently ignore stats update failures
          })

          throw error
        }
      },
    }
  }

  return bindings
}

/**
 * Create a simple binding record for skills without full sandbox execution.
 * This is used when skills are being documented in the system prompt
 * but not yet being executed.
 */
export function skillsToSimpleBindings(
  skills: Array<Skill>,
): Record<string, ToolBinding> {
  const bindings: Record<string, ToolBinding> = {}

  for (const skill of skills) {
    const bindingName = `skill_${skill.name}`

    bindings[bindingName] = {
      name: bindingName,
      description: skill.description,
      inputSchema: skill.inputSchema,
      outputSchema: skill.outputSchema,
      execute: async () => {
        throw new Error(
          `Skill ${skill.name} is not available for execution in this context`,
        )
      },
    }
  }

  return bindings
}
