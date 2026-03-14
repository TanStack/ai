import { chat, maxIterations } from '@tanstack/ai'
import {
  createSkillManagementTools,
  createSkillsSystemPrompt,
  skillsToTools,
} from '@tanstack/ai-code-mode-skills'
import type { AnyTextAdapter, StreamChunk, Tool } from '@tanstack/ai'
import type { CodeModeTool, IsolateDriver } from '@tanstack/ai-code-mode'
import type { SkillStorage, TrustStrategy } from '@tanstack/ai-code-mode-skills'

export interface StructuredOutputOptions {
  adapter: AnyTextAdapter
  prompt: string
  jsonSchemaDescription: string
  codeMode: {
    tool: Tool<any, any, any>
    systemPrompt: string
    driver: IsolateDriver
    codeTools: Array<CodeModeTool>
  }
  skills?: {
    storage: SkillStorage
    trustStrategy: TrustStrategy
    timeout?: number
    memoryLimit?: number
  }
  tools?: Array<Tool<any, any, any>>
  maxIterations?: number
  maxTokens?: number
}

const SKILL_REGISTRATION_PROMPT = `## Skill Registration — MANDATORY

After every successful \`execute_typescript\` call you MUST register the code as a reusable skill using \`register_skill\` — unless an identical skill already exists.

Rules:
- \`name\`: descriptive snake_case (e.g. \`get_average_product_price\`)
- \`code\`: the TypeScript code, parameterised with an \`input\` variable where useful
- \`inputSchema\` / \`outputSchema\`: valid JSON Schema **strings**
- If a skill with the same name exists, skip registration

This is not optional — skill registration is a core part of your workflow.`

export async function structuredOutput(
  options: StructuredOutputOptions,
): Promise<unknown> {
  const {
    adapter,
    prompt,
    jsonSchemaDescription,
    codeMode,
    skills,
    tools = [],
    maxIterations: maxIter = 10,
    maxTokens: maxTok = 8192,
  } = options

  const toolGuidance = skills
    ? `2. If a skill tool matches what you need, call it directly — skill tools are faster and preferred over writing new code.
3. Use execute_typescript only for tasks not covered by existing skill tools. After successful execute_typescript calls, register the code as a reusable skill.
4. After all tool calls are done, output ONLY a single raw JSON object (no code fences, no markdown, no prose before or after).`
    : `2. Immediately call execute_typescript to use the available tools. Chain multiple tool calls if needed.
3. After all tool calls are done, output ONLY a single raw JSON object (no code fences, no markdown, no prose before or after).`

  const systemPrompt = `${prompt}

RULES — follow these exactly:
1. Do NOT produce any conversational text at any point. No greetings, no "let me", no narration, no status updates, no commentary. SILENCE except for tool calls and the final JSON.
${toolGuidance}
The JSON must match this schema exactly:

${jsonSchemaDescription}

Every field is required. Arrays must have at least one element.`

  let allTools: Array<Tool<any, any, any>> = [codeMode.tool, ...tools]
  const systemPrompts = [systemPrompt, codeMode.systemPrompt]

  if (skills) {
    const allSkills = await skills.storage.loadAll()
    const skillIndex = await skills.storage.loadIndex()

    if (allSkills.length > 0) {
      const skillToolsList = skillsToTools({
        skills: allSkills,
        driver: codeMode.driver,
        tools: codeMode.codeTools,
        storage: skills.storage,
        timeout: skills.timeout ?? 60000,
        memoryLimit: skills.memoryLimit ?? 128,
      })
      allTools = [...allTools, ...skillToolsList.map(wrapToolWithLogging)]
    }

    const mgmtTools = createSkillManagementTools({
      storage: skills.storage,
      trustStrategy: skills.trustStrategy,
    })
    allTools = [...allTools, ...mgmtTools.map(wrapToolWithLogging)]

    const libraryPrompt = createSkillsSystemPrompt({
      selectedSkills: allSkills,
      totalSkillCount: skillIndex.length,
      skillsAsTools: true,
    })
    systemPrompts.push(libraryPrompt + '\n\n' + SKILL_REGISTRATION_PROMPT)
  }

  console.log(
    '[StructuredOutput] Tools passed to chat:',
    allTools.map((t) => t.name),
  )

  const stream = chat({
    adapter,
    messages: [{ role: 'user' as const, content: prompt }],
    tools: allTools,
    systemPrompts,
    agentLoopStrategy: maxIterations(maxIter),
    maxTokens: maxTok,
  })

  return extractJsonFromStream(stream)
}

function wrapToolWithLogging(tool: Tool<any, any, any>): Tool<any, any, any> {
  const originalExecute = tool.execute
  if (!originalExecute) return tool

  return {
    ...tool,
    execute: async (args: any, context?: any) => {
      console.log(`[SkillTool] Calling "${tool.name}" with:`, JSON.stringify(args, null, 2))
      try {
        const result = await originalExecute(args, context)
        console.log(`[SkillTool] "${tool.name}" returned:`, JSON.stringify(result, null, 2).slice(0, 500))
        return result
      } catch (err) {
        console.error(`[SkillTool] "${tool.name}" threw:`, err)
        throw err
      }
    },
  }
}

async function extractJsonFromStream(
  stream: AsyncIterable<StreamChunk>,
): Promise<unknown> {
  let lastAssistantText = ''
  let currentText = ''

  for await (const chunk of stream) {
    if (chunk.type === 'TEXT_MESSAGE_CONTENT' && chunk.delta) {
      currentText += chunk.delta
    }

    if (chunk.type === 'RUN_FINISHED') {
      if (currentText.trim()) {
        lastAssistantText = currentText
      }
      currentText = ''
    }
  }

  let jsonText = lastAssistantText.trim()
  if (!jsonText) {
    throw new Error('Model did not produce any text output.')
  }

  jsonText = jsonText
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/i, '')
    .trim()

  return JSON.parse(jsonText)
}
