import { toolDefinition } from '@tanstack/ai'
import { toolsToBindings } from '@tanstack/ai-code-mode'
import { z } from 'zod'
import { createDefaultTrustStrategy } from './trust-strategies'
import { skillToTool } from './skills-to-tools'
import type { ServerTool, ToolRegistry } from '@tanstack/ai'
import type { CodeModeToolConfig, ToolBinding } from '@tanstack/ai-code-mode'
import type { SkillStorage } from './types'
import type { TrustStrategy } from './trust-strategies'

interface CreateSkillManagementToolsOptions {
  /**
   * Storage implementation for skills
   */
  storage: SkillStorage

  /**
   * Trust strategy for determining initial trust level.
   * If not provided, uses the storage's trustStrategy or falls back to default.
   */
  trustStrategy?: TrustStrategy

  /**
   * Tool registry for adding newly registered skills immediately.
   * When provided, register_skill will add the new skill to this registry
   * so it's available as a direct tool in the current chat session.
   */
  registry?: ToolRegistry

  /**
   * Code mode config for creating skill tools.
   * Required when registry is provided.
   */
  config?: CodeModeToolConfig

  /**
   * Pre-computed bindings for external_* functions.
   * Required when registry is provided.
   */
  baseBindings?: Record<string, ToolBinding>
}

/**
 * Create tools for searching, retrieving, and registering skills.
 * These tools allow the LLM to interact with the skill library at runtime.
 *
 * When registry, config, and baseBindings are provided, newly registered skills
 * will be immediately added to the registry and available as direct tools.
 */
export function createSkillManagementTools({
  storage,
  trustStrategy,
  registry,
  config,
  baseBindings,
}: CreateSkillManagementToolsOptions): Array<ServerTool<any, any, any>> {
  // Use provided strategy, or storage's strategy, or default
  const strategy =
    trustStrategy ?? storage.trustStrategy ?? createDefaultTrustStrategy()

  // Compute bindings if not provided but config is available
  const bindings =
    baseBindings ?? (config ? toolsToBindings(config.tools, 'external_') : {})
  return [
    // Search for skills
    toolDefinition({
      name: 'search_skills',
      description:
        'Search the skill library for reusable skills. Use this to find skills that can help accomplish a task. Returns matching skills with their descriptions.',
      inputSchema: z.object({
        query: z
          .string()
          .describe('Search query describing what you want to accomplish'),
        limit: z
          .number()
          .optional()
          .default(5)
          .describe('Maximum number of results (default: 5)'),
      }),
      outputSchema: z.array(
        z.object({
          name: z.string(),
          description: z.string(),
          usageHints: z.array(z.string()),
          trustLevel: z.enum(['untrusted', 'provisional', 'trusted']),
        }),
      ),
    }).server(async ({ query, limit }) => {
      const results = await storage.search(query, { limit: limit ?? 5 })
      return results.map((s) => ({
        name: s.name,
        description: s.description,
        usageHints: s.usageHints,
        trustLevel: s.trustLevel,
      }))
    }),

    // Get full skill details
    toolDefinition({
      name: 'get_skill',
      description:
        'Get the full implementation details of a skill, including its code. Use this after search_skills to see how a skill works before using it.',
      inputSchema: z.object({
        name: z.string().describe('The skill name (without skill_ prefix)'),
      }),
      outputSchema: z.object({
        name: z.string().optional(),
        description: z.string().optional(),
        code: z.string().optional(),
        inputSchema: z.string().optional().describe('JSON Schema as string'),
        outputSchema: z.string().optional().describe('JSON Schema as string'),
        usageHints: z.array(z.string()).optional(),
        dependsOn: z.array(z.string()).optional(),
        trustLevel: z.enum(['untrusted', 'provisional', 'trusted']).optional(),
        stats: z
          .object({
            executions: z.number(),
            successRate: z.number(),
          })
          .optional(),
        error: z.string().optional(),
      }),
    }).server(async ({ name }) => {
      const skill = await storage.get(name)
      if (!skill) {
        return { error: `Skill '${name}' not found` }
      }
      return {
        name: skill.name,
        description: skill.description,
        code: skill.code,
        inputSchema: JSON.stringify(skill.inputSchema),
        outputSchema: JSON.stringify(skill.outputSchema),
        usageHints: skill.usageHints,
        dependsOn: skill.dependsOn,
        trustLevel: skill.trustLevel,
        stats: skill.stats,
      }
    }),

    // Register a new skill
    toolDefinition({
      name: 'register_skill',
      description:
        'Save working TypeScript code as a reusable skill for future use. Only register code that has been tested and works correctly. The skill becomes available as a callable tool immediately.',
      inputSchema: z.object({
        name: z
          .string()
          .regex(
            /^[a-z][a-z0-9_]*$/,
            'Must be snake_case starting with a letter',
          )
          .describe(
            'Unique skill name in snake_case (e.g., fetch_github_stats)',
          ),
        description: z
          .string()
          .describe('Clear description of what the skill does'),
        code: z
          .string()
          .describe(
            'The TypeScript code. Receives `input` variable, can call external_* and skill_* functions, should return a value.',
          ),
        inputSchema: z
          .string()
          .describe(
            'JSON Schema as a JSON string describing the input parameter, e.g. {"type":"object","properties":{"a":{"type":"number"}},"required":["a"]}',
          ),
        outputSchema: z
          .string()
          .describe(
            'JSON Schema as a JSON string describing the return value, e.g. {"type":"object","properties":{"result":{"type":"number"}}}',
          ),
        usageHints: z
          .array(z.string())
          .describe(
            'Hints about when to use this skill, e.g. "Use when user asks about..."',
          ),
        dependsOn: z
          .array(z.string())
          .optional()
          .default([])
          .describe('Names of other skills this skill calls'),
      }),
      outputSchema: z.object({
        success: z.boolean().optional(),
        skillId: z.string().optional(),
        name: z.string().optional(),
        message: z.string().optional(),
        error: z.string().optional(),
      }),
    }).server(async (rawSkillDef, context) => {
      // Parse the JSON string schemas
      let inputSchema: Record<string, unknown>
      let outputSchema: Record<string, unknown>
      try {
        inputSchema = JSON.parse(rawSkillDef.inputSchema) as Record<
          string,
          unknown
        >
      } catch {
        return { error: 'inputSchema must be a valid JSON string' }
      }
      try {
        outputSchema = JSON.parse(rawSkillDef.outputSchema) as Record<
          string,
          unknown
        >
      } catch {
        return { error: 'outputSchema must be a valid JSON string' }
      }

      const skillDef = {
        ...rawSkillDef,
        inputSchema,
        outputSchema,
      }
      try {
        // Validate the skill name isn't reserved
        if (skillDef.name.startsWith('external_')) {
          return { error: "Skill names cannot start with 'external_'" }
        }
        if (skillDef.name.startsWith('skill_')) {
          return {
            error:
              "Skill names should not include the 'skill_' prefix - it will be added automatically",
          }
        }

        // Check if skill already exists
        const existing = await storage.get(skillDef.name)
        if (existing) {
          return {
            error: `Skill '${skillDef.name}' already exists. Use a different name or update the existing skill.`,
          }
        }

        // Generate a unique ID
        const id = crypto.randomUUID()

        // Get initial trust level from strategy
        const initialTrustLevel = strategy.getInitialTrustLevel()

        // Save the skill
        const skill = await storage.save({
          id,
          name: skillDef.name,
          description: skillDef.description,
          code: skillDef.code,
          inputSchema: skillDef.inputSchema,
          outputSchema: skillDef.outputSchema,
          usageHints: skillDef.usageHints,
          dependsOn: skillDef.dependsOn ?? [],
          trustLevel: initialTrustLevel,
          stats: { executions: 0, successRate: 0 },
        })

        // If registry and config are available, add the skill as a tool immediately
        if (registry && config) {
          const skillTool = skillToTool({
            skill,
            driver: config.driver,
            bindings,
            storage,
            timeout: config.timeout,
            memoryLimit: config.memoryLimit,
          })
          registry.add(skillTool)
          console.log(
            `[register_skill] Added skill '${skill.name}' to registry immediately`,
          )
        }

        // Emit event for UI notification
        context?.emitCustomEvent('skill:registered', {
          id: skill.id,
          name: skill.name,
          description: skill.description,
          timestamp: Date.now(),
        })

        return {
          success: true,
          skillId: skill.id,
          name: skill.name,
          message: `Skill '${skill.name}' registered successfully and is now available as the '${skill.name}' tool.`,
        }
      } catch (error) {
        console.error('[register_skill] Error:', error)
        return {
          error: `Failed to register skill: ${error instanceof Error ? error.message : String(error)}`,
        }
      }
    }),
  ]
}
