import { chat, maxIterations } from '@tanstack/ai'
import {
  createSkillManagementTools,
  createSkillsSystemPrompt,
  skillsToTools,
} from '@tanstack/ai-code-mode-skills'
import type { AnyTextAdapter, SchemaInput, Tool } from '@tanstack/ai'
import type { CodeModeTool, IsolateDriver } from '@tanstack/ai-code-mode'
import type { SkillStorage, TrustStrategy } from '@tanstack/ai-code-mode-skills'

export interface StructuredOutputOptions<TSchema extends SchemaInput> {
  adapter: AnyTextAdapter
  prompt: string
  outputSchema: TSchema
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

export async function structuredOutput<TSchema extends SchemaInput>(
  options: StructuredOutputOptions<TSchema>,
) {
  const {
    adapter,
    prompt,
    outputSchema,
    codeMode,
    skills,
    tools = [],
    maxIterations: maxIter = 10,
    maxTokens: maxTok = 8192,
  } = options

  const skillGuidance = skills
    ? `- If a skill tool matches what you need, call it directly — skill tools are faster and preferred over writing new code.
- Use execute_typescript only for tasks not covered by existing skill tools. After successful execute_typescript calls, register the code as a reusable skill.`
    : `- Use execute_typescript to gather the data you need. Chain multiple tool calls if needed.`

  const systemPrompt = `${prompt}

RULES:
- Do NOT produce conversational text. No greetings, no narration. Only tool calls and the final structured response.
${skillGuidance}`

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
      allTools = [...allTools, ...skillToolsList]
    }

    const mgmtTools = createSkillManagementTools({
      storage: skills.storage,
      trustStrategy: skills.trustStrategy,
    })
    allTools = [...allTools, ...mgmtTools]

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

  const result = await chat({
    adapter,
    messages: [{ role: 'user' as const, content: prompt }],
    tools: allTools,
    systemPrompts,
    agentLoopStrategy: maxIterations(maxIter),
    maxTokens: maxTok,
    outputSchema,
  })

  return result
}
