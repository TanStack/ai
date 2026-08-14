import { chat, maxIterations } from '@tanstack/ai'
import {
  createSnippetManagementTools,
  createSnippetsSystemPrompt,
  snippetsToTools,
} from '@tanstack/ai-code-mode-snippets'
import { maxTokensModelOptions } from './max-tokens-model-options'
import type { AnyTextAdapter, AnyTool, SchemaInput } from '@tanstack/ai'
import type { CodeModeTool, IsolateDriver } from '@tanstack/ai-code-mode'
import type { SnippetStorage, TrustStrategy } from '@tanstack/ai-code-mode-snippets'

export interface StructuredOutputOptions<TSchema extends SchemaInput> {
  adapter: AnyTextAdapter
  prompt: string
  outputSchema: TSchema
  codeMode: {
    tool: AnyTool
    systemPrompt: string
    driver: IsolateDriver
    codeTools: Array<CodeModeTool>
  }
  snippets?: {
    storage: SnippetStorage
    trustStrategy: TrustStrategy
    timeout?: number
    memoryLimit?: number
  }
  tools?: Array<AnyTool>
  maxIterations?: number
  maxTokens?: number
}

const SNIPPET_REGISTRATION_PROMPT = `## Snippet Registration — MANDATORY

After every successful \`execute_typescript\` call you MUST register the code as a reusable snippet using \`register_snippet\` — unless an identical snippet already exists.

Rules:
- \`name\`: descriptive snake_case (e.g. \`get_average_product_price\`)
- \`code\`: the TypeScript code, parameterised with an \`input\` variable where useful
- \`inputSchema\` / \`outputSchema\`: valid JSON Schema **strings**
- If a snippet with the same name exists, skip registration

This is not optional — snippet registration is a core part of your workflow.`

export async function structuredOutput<TSchema extends SchemaInput>(
  options: StructuredOutputOptions<TSchema>,
) {
  const {
    adapter,
    prompt,
    outputSchema,
    codeMode,
    snippets,
    tools = [],
    maxIterations: maxIter = 10,
    maxTokens: maxTok = 8192,
  } = options

  const snippetGuidance = snippets
    ? `- If a snippet tool matches what you need, call it directly — snippet tools are faster and preferred over writing new code.
- Use execute_typescript only for tasks not covered by existing snippet tools. After successful execute_typescript calls, register the code as a reusable snippet.`
    : `- Use execute_typescript to gather the data you need. Chain multiple tool calls if needed.`

  const systemPrompt = `${prompt}

RULES:
- Do NOT produce conversational text. No greetings, no narration. Only tool calls and the final structured response.
${snippetGuidance}`

  let allTools: Array<AnyTool> = [codeMode.tool, ...tools]
  const systemPrompts = [systemPrompt, codeMode.systemPrompt]

  if (snippets) {
    const allSnippets = await snippets.storage.loadAll()
    const snippetIndex = await snippets.storage.loadIndex()

    if (allSnippets.length > 0) {
      const snippetToolsList = snippetsToTools({
        snippets: allSnippets,
        driver: codeMode.driver,
        tools: codeMode.codeTools,
        storage: snippets.storage,
        timeout: snippets.timeout ?? 60000,
        memoryLimit: snippets.memoryLimit ?? 128,
      })
      allTools = [...allTools, ...snippetToolsList]
    }

    const mgmtTools = createSnippetManagementTools({
      storage: snippets.storage,
      trustStrategy: snippets.trustStrategy,
    })
    allTools = [...allTools, ...mgmtTools]

    const libraryPrompt = createSnippetsSystemPrompt({
      selectedSnippets: allSnippets,
      totalSnippetCount: snippetIndex.length,
      snippetsAsTools: true,
    })
    systemPrompts.push(libraryPrompt + '\n\n' + SNIPPET_REGISTRATION_PROMPT)
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
    // Sampling lives in provider-native `modelOptions` now; map the generic
    // cap to the resolved adapter's wire key.
    modelOptions: maxTokensModelOptions(adapter, maxTok),
    outputSchema,
  })

  return result
}
