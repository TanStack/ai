import {
  codeExecutionTool,
  codeInterpreterTool,
  collectionsSearchTool,
  fileSearchTool,
  mcpTool,
  webSearchTool,
  xSearchTool,
} from '../src/tools'
import {
  loadApiKey,
  resolveModel,
  streamChat,
  supportsBuiltInServerTools,
  textFromChunks,
} from './helpers'
import type { StreamChunk, Tool } from '@tanstack/ai'

const apiKey = loadApiKey()
const model = resolveModel()

async function runCase(
  name: string,
  tools: Array<Tool>,
  prompt: string,
  options?: { requireToolUse?: boolean },
) {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of streamChat({
    model,
    apiKey,
    messages: [{ role: 'user', content: prompt }],
    tools,
    maxTokens: 64,
    modelOptions: options?.requireToolUse ? { tool_choice: 'required' } : {},
  })) {
    chunks.push(chunk)
  }

  const hasRunFinished = chunks.some((chunk) => chunk.type === 'RUN_FINISHED')
  if (!hasRunFinished) {
    throw new Error(`${name}: RUN_FINISHED not emitted`)
  }

  const text = textFromChunks(chunks)

  console.log(`PASS: ${name}`)
  console.log(`  response: ${JSON.stringify(text.slice(0, 120))}`)
}

async function main() {
  console.log(`Testing Grok built-in server-side tools — model=${model}\n`)

  if (!supportsBuiltInServerTools(model)) {
    console.log(
      `SKIP: ${model} does not advertise built-in server-side tools in this adapter yet`,
    )
    return
  }

  await runCase('web_search', [webSearchTool()], 'Say hi.')

  await runCase(
    'x_search',
    [xSearchTool({ allowed_x_handles: ['xai'] })],
    'Say hi.',
  )

  await runCase('code_execution', [codeExecutionTool()], 'Say hi.')

  await runCase(
    'code_interpreter',
    [codeInterpreterTool({ type: 'auto' })],
    'Say hi.',
  )

  const vectorStoreId = process.env.XAI_VECTOR_STORE_ID
  if (vectorStoreId) {
    await runCase(
      'file_search',
      [fileSearchTool({ type: 'file_search', vector_store_ids: [vectorStoreId] })],
      'Use file_search and answer with a short greeting.',
    )

    await runCase(
      'collections_search',
      [
        collectionsSearchTool({
          vector_store_ids: [vectorStoreId],
        }),
      ],
      'Use collections_search and answer with a short greeting.',
    )
  } else {
    console.log('SKIP: file_search / collections_search (set XAI_VECTOR_STORE_ID)')
  }

  const mcpServerUrl = process.env.XAI_MCP_SERVER_URL
  if (mcpServerUrl) {
    await runCase(
      'mcp',
      [
        mcpTool({
          server_url: mcpServerUrl,
          server_label: 'test-mcp',
        }),
      ],
      'Use mcp and answer with a short greeting.',
    )
  } else {
    console.log('SKIP: mcp (set XAI_MCP_SERVER_URL)')
  }
}

main().catch((error) => {
  console.error('ERROR:', error.message)
  process.exit(1)
})
