import { toolDefinition } from '@tanstack/ai'
import {
  createEventAwareBindings,
  stripTypeScript,
  toolsToBindings,
} from '@tanstack/ai-code-mode'
import { z } from 'zod'
import type { ServerTool, ToolExecutionContext } from '@tanstack/ai'
import type {
  CodeModeTool,
  IsolateDriver,
  ToolBinding,
} from '@tanstack/ai-code-mode'
import type { Skill, SkillStorage } from './types'

/**
 * Options for converting a single skill to a tool
 */
export interface SkillToToolOptions {
  /**
   * The skill to convert
   */
  skill: Skill

  /**
   * Isolate driver for executing skill code
   */
  driver: IsolateDriver

  /**
   * Pre-computed bindings for external_* functions
   */
  bindings: Record<string, ToolBinding>

  /**
   * Storage for updating execution stats
   */
  storage: SkillStorage

  /**
   * Timeout for skill execution in ms
   * @default 30000
   */
  timeout?: number

  /**
   * Memory limit in bytes
   * @default 128
   */
  memoryLimit?: number
}

interface SkillsToToolsOptions {
  /**
   * Skills to convert to tools
   */
  skills: Array<Skill>

  /**
   * Isolate driver for executing skill code
   */
  driver: IsolateDriver

  /**
   * Original tools that become external_* bindings
   * (so skills can call external_* functions)
   */
  tools: Array<CodeModeTool>

  /**
   * Storage for updating execution stats
   */
  storage: SkillStorage

  /**
   * Timeout for skill execution in ms
   * @default 30000
   */
  timeout?: number

  /**
   * Memory limit in bytes
   * @default 128
   */
  memoryLimit?: number
}

/**
 * Convert JSON Schema to Zod schema.
 * This is a simplified converter that handles common cases.
 */
function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodType {
  const type = schema.type as string

  if (type === 'string') {
    let zodString = z.string()
    if (schema.description) {
      zodString = zodString.describe(schema.description as string)
    }
    return zodString
  }
  if (type === 'number' || type === 'integer') {
    let zodNum = z.number()
    if (schema.description) {
      zodNum = zodNum.describe(schema.description as string)
    }
    return zodNum
  }
  if (type === 'boolean') {
    let zodBool = z.boolean()
    if (schema.description) {
      zodBool = zodBool.describe(schema.description as string)
    }
    return zodBool
  }
  if (type === 'array') {
    const items = schema.items as Record<string, unknown> | undefined
    if (items) {
      return z.array(jsonSchemaToZod(items))
    }
    return z.array(z.unknown())
  }
  if (type === 'object') {
    const properties = schema.properties as
      | Record<string, Record<string, unknown>>
      | undefined
    const required = (schema.required as Array<string> | undefined) ?? []

    if (properties) {
      const shape: Record<string, z.ZodType> = {}
      for (const [key, propSchema] of Object.entries(properties)) {
        let zodProp = jsonSchemaToZod(propSchema)
        if (!required.includes(key)) {
          zodProp = zodProp.optional()
        }
        shape[key] = zodProp
      }
      return z.object(shape)
    }
    return z.record(z.string(), z.unknown())
  }

  // Fallback
  return z.unknown()
}

/**
 * Convert a single skill to a ServerTool that the LLM can call directly.
 * The skill executes its code in the sandbox with access to external_* bindings.
 */
export function skillToTool({
  skill,
  driver,
  bindings,
  storage,
  timeout = 30000,
  memoryLimit = 128,
}: SkillToToolOptions): ServerTool<any, any, any> {
  // Generate input and output schemas from JSON Schema
  const inputSchema = jsonSchemaToZod(skill.inputSchema)
  const outputSchema = jsonSchemaToZod(skill.outputSchema)

  return toolDefinition({
    name: skill.name,
    description: `[SKILL] ${skill.description}`,
    inputSchema,
    outputSchema,
  }).server(async (input: unknown, context?: ToolExecutionContext) => {
    const startTime = Date.now()
    const emitCustomEvent = context?.emitCustomEvent || (() => {})

    // Emit skill call event
    emitCustomEvent('code_mode:skill_call', {
      skill: skill.name,
      input,
      timestamp: startTime,
    })

    let isolateContext = null

    try {
      console.log(
        `[Skill:${skill.name}] Starting execution with input:`,
        JSON.stringify(input).substring(0, 200),
      )

      // Wrap the skill code to receive input as a variable
      const wrappedCode = `
          const input = ${JSON.stringify(input)};
          ${skill.code}
        `
      console.log(
        `[Skill:${skill.name}] Wrapped code (first 500 chars):`,
        wrappedCode.substring(0, 500),
      )

      // Strip TypeScript to JavaScript
      const strippedCode = await stripTypeScript(wrappedCode)
      console.log(
        `[Skill:${skill.name}] Stripped code (first 500 chars):`,
        strippedCode.substring(0, 500),
      )

      // Create event-aware bindings
      const eventAwareBindings = createEventAwareBindings(
        bindings,
        emitCustomEvent,
      )
      console.log(
        `[Skill:${skill.name}] Event-aware bindings:`,
        Object.keys(eventAwareBindings),
      )

      // Create sandbox context
      console.log(`[Skill:${skill.name}] Creating sandbox context...`)
      isolateContext = await driver.createContext({
        bindings: eventAwareBindings,
        timeout,
        memoryLimit,
      })
      console.log(`[Skill:${skill.name}] Sandbox context created`)

      // Execute the code
      console.log(`[Skill:${skill.name}] Executing code...`)
      const executionResult = await isolateContext.execute(strippedCode)
      console.log(`[Skill:${skill.name}] Execution result:`, {
        success: executionResult.success,
        hasValue: 'value' in executionResult,
        error: executionResult.error,
        logs: executionResult.logs,
      })

      const duration = Date.now() - startTime

      if (!executionResult.success) {
        console.error(
          `[Skill:${skill.name}] Execution failed:`,
          executionResult.error,
        )
        throw new Error(
          executionResult.error?.message || 'Skill execution failed',
        )
      }

      // Emit success event
      emitCustomEvent('code_mode:skill_result', {
        skill: skill.name,
        result: executionResult.value,
        duration,
        timestamp: Date.now(),
      })

      // Update stats (async, don't await to not block)
      storage.updateStats(skill.name, true).catch(() => {
        // Silently ignore stats update failures
      })

      return executionResult.value
    } catch (error) {
      const duration = Date.now() - startTime
      console.error(`[Skill:${skill.name}] CAUGHT ERROR:`, {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        duration,
      })

      // Emit error event
      emitCustomEvent('code_mode:skill_error', {
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
    } finally {
      if (isolateContext) {
        await isolateContext.dispose()
      }
    }
  })
}

/**
 * Convert multiple skills to ServerTools that the LLM can call directly.
 * Skills become real tools that execute their code in the sandbox.
 */
export function skillsToTools({
  skills,
  driver,
  tools,
  storage,
  timeout = 30000,
  memoryLimit = 128,
}: SkillsToToolsOptions): Array<ServerTool<any, any, any>> {
  // Pre-compute bindings from tools (these are shared across all skill executions)
  console.log(
    '[SkillsToTools] Creating bindings from tools:',
    tools.map((t) => t.name),
  )
  const bindings = toolsToBindings(tools, 'external_')
  console.log('[SkillsToTools] Created bindings:', Object.keys(bindings))

  return skills.map((skill) =>
    skillToTool({
      skill,
      driver,
      bindings,
      storage,
      timeout,
      memoryLimit,
    }),
  )
}
