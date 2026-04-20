import {
  createCodeModeSystemPrompt,
  createCodeModeTool,
  toolsToBindings,
} from '@tanstack/ai-code-mode'
import { createToolRegistry } from '@tanstack/ai'
import { selectRelevantSkills } from './select-relevant-skills'
import { createSkillManagementTools } from './create-skill-management-tools'
import { createSkillsSystemPrompt } from './create-skills-system-prompt'
import { skillsToTools } from './skills-to-tools'
import type {
  CodeModeWithSkillsOptions,
  CodeModeWithSkillsResult,
  Skill,
} from './types'

export type { CodeModeWithSkillsOptions, CodeModeWithSkillsResult }

/**
 * Create Code Mode tools and system prompt with skills integration.
 *
 * This function:
 * 1. Loads the skill index from storage
 * 2. Uses a cheap/fast LLM to select relevant skills based on conversation context
 * 3. Creates the execute_typescript tool with dynamic skill bindings
 * 4. Creates skill management tools (search, get, register)
 * 5. Generates system prompts documenting available skills
 * 6. Returns a ToolRegistry that allows dynamic skill additions mid-stream
 *
 * @example
 * ```typescript
 * const { toolsRegistry, systemPrompt, selectedSkills } = await codeModeWithSkills({
 *   config: {
 *     driver: createNodeIsolateDriver(),
 *     tools: allTools,
 *     timeout: 60000,
 *   },
 *   adapter: openaiText('gpt-4o-mini'),  // Cheap model for selection
 *   skills: {
 *     storage: createFileSkillStorage('./.skills'),
 *     maxSkillsInContext: 5,
 *   },
 *   messages,
 * });
 *
 * const stream = chat({
 *   adapter: openaiText('gpt-4o'),  // Main model
 *   toolRegistry: toolsRegistry,  // Dynamic tool registry
 *   messages,
 *   systemPrompts: [BASE_PROMPT, systemPrompt],
 * });
 * ```
 */
export async function codeModeWithSkills({
  config,
  adapter,
  skills,
  messages,
  skillsAsTools = true,
}: CodeModeWithSkillsOptions): Promise<CodeModeWithSkillsResult> {
  const { storage, maxSkillsInContext = 5 } = skills

  // 1. Load the skill index (lightweight metadata only)
  const skillIndex = await storage.loadIndex()

  // 2. Use adapter to select relevant skills based on transcript
  const selectedSkills = await selectRelevantSkills({
    adapter,
    messages,
    skillIndex,
    maxSkills: maxSkillsInContext,
    storage,
  })

  // Pre-compute bindings from base tools (shared across skill executions)
  const baseBindings = toolsToBindings(config.tools, 'external_')

  // 3. Create the execute_typescript tool with dynamic skill bindings
  const codeModeTool = createCodeModeTool({
    ...config,
    // Dynamic skill bindings - fetched at execution time
    getSkillBindings: async () => {
      // Get all skills from storage (includes newly registered ones)
      const allSkills = await storage.loadAll()
      // Convert to bindings with skill_ prefix
      const skillBindings: Record<string, any> = {}
      for (const skill of allSkills) {
        // Create a simple binding that executes the skill code
        skillBindings[`skill_${skill.name}`] = {
          name: `skill_${skill.name}`,
          description: skill.description,
          inputSchema: skill.inputSchema,
          outputSchema: skill.outputSchema,
          execute: async (input: unknown) => {
            // This is a simplified execution - the full skillToTool handles events
            const wrappedCode = `const input = ${JSON.stringify(input)};\n${skill.code}`
            const { stripTypeScript, createEventAwareBindings } =
              await import('@tanstack/ai-code-mode')
            const strippedCode = await stripTypeScript(wrappedCode)
            const context = await config.driver.createContext({
              bindings: createEventAwareBindings(baseBindings, () => {}),
              timeout: config.timeout,
              memoryLimit: config.memoryLimit,
            })
            try {
              const result = await context.execute(strippedCode)
              if (!result.success) {
                throw new Error(
                  result.error?.message || 'Skill execution failed',
                )
              }
              return result.value
            } finally {
              await context.dispose()
            }
          },
        }
      }
      return skillBindings
    },
  })

  // 4. Create a mutable tool registry
  const registry = createToolRegistry()

  // 5. Add the execute_typescript tool to the registry
  registry.add(codeModeTool)

  // 6. Create skill management tools (they need access to the registry)
  const skillManagementTools = createSkillManagementTools({
    storage,
    registry,
    config,
    baseBindings,
  })

  for (const tool of skillManagementTools) {
    registry.add(tool)
  }

  // 7. Convert selected skills to direct tools and add to registry (if enabled)
  if (skillsAsTools && selectedSkills.length > 0) {
    const skillToolsList = skillsToTools({
      skills: selectedSkills,
      driver: config.driver,
      tools: config.tools,
      storage,
      timeout: config.timeout,
      memoryLimit: config.memoryLimit,
    })

    for (const skillTool of skillToolsList) {
      registry.add(skillTool)
    }
  }

  // 8. Generate combined system prompt
  const basePrompt = createCodeModeSystemPrompt(config)
  const skillsPrompt = createSkillsSystemPrompt({
    selectedSkills,
    totalSkillCount: skillIndex.length,
    skillsAsTools,
  })
  const systemPrompt = basePrompt + '\n\n' + skillsPrompt

  return {
    toolsRegistry: registry,
    systemPrompt,
    selectedSkills,
  }
}

/**
 * Create a Code Mode tool configuration extended with skills.
 * This is an alternative to codeModeWithSkills that returns
 * a config object instead of directly creating tools.
 *
 * Useful when you want more control over the tool creation process.
 */
export function createCodeModeWithSkillsConfig({
  config,
  selectedSkills,
  storage,
}: {
  config: CodeModeWithSkillsOptions['config']
  selectedSkills: Array<Skill>
  storage: CodeModeWithSkillsOptions['skills']['storage']
}) {
  // Create skill tools for direct calling
  const skillToolsList = skillsToTools({
    skills: selectedSkills,
    driver: config.driver,
    tools: config.tools,
    storage,
    timeout: config.timeout,
    memoryLimit: config.memoryLimit,
  })

  return {
    ...config,
    skillTools: skillToolsList,
    selectedSkills,
  }
}
