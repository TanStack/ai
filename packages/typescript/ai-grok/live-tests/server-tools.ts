import {
  codeExecutionTool,
  codeInterpreterTool,
  collectionsSearchTool,
  fileSearchTool,
} from '../src/tools'
import { assert, loadApiKey, streamChat, textFromChunks } from './helpers'
import type { StreamChunk, Tool } from '@tanstack/ai'

const apiKey = loadApiKey()
const vectorStoreId = process.env.XAI_VECTOR_STORE_ID

async function runCase(
  name: string,
  prompt: string,
  tools: Array<Tool>,
  validate: (text: string) => void,
) {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of streamChat({
    model: 'grok-4.3',
    apiKey,
    messages: [{ role: 'user', content: prompt }],
    tools,
    maxTokens: 192,
  })) {
    chunks.push(chunk)
  }

  assert(
    chunks.some((chunk) => chunk.type === 'RUN_FINISHED'),
    `${name}: RUN_FINISHED not emitted`,
  )

  const text = textFromChunks(chunks)

  validate(text)
  console.log(`PASS: ${name}`)
  console.log(`  response: ${JSON.stringify(text.slice(0, 160))}`)
}

async function main() {
  console.log('Testing additional Grok server-side tools\n')

  await runCase(
    'code_execution',
    'Use code_execution to compute the sum of integers from 1 to 10. Answer only with the result.',
    [codeExecutionTool()],
    (text) => {
      assert(
        /55/.test(text),
        `code_execution: expected result 55, got ${JSON.stringify(text)}`,
      )
    },
  )

  await runCase(
    'code_interpreter',
    'Use code_interpreter to compute 12 * 12. Answer only with the result.',
    [codeInterpreterTool({ type: 'auto' })],
    (text) => {
      assert(
        /144/.test(text),
        `code_interpreter: expected result 144, got ${JSON.stringify(text)}`,
      )
    },
  )

  if (!vectorStoreId) {
    console.log('SKIP: file_search / collections_search (set XAI_VECTOR_STORE_ID)')
    return
  }

  await runCase(
    'file_search',
    'Use file_search on the provided collection and answer with a short greeting if the search works.',
    [fileSearchTool({ type: 'file_search', vector_store_ids: [vectorStoreId] })],
    (text) => {
      assert(text.trim().length > 0, 'file_search: empty response')
    },
  )

  await runCase(
    'collections_search',
    'Use collections_search on the provided collection and answer with a short greeting if the search works.',
    [
      collectionsSearchTool({
        vector_store_ids: [vectorStoreId],
      }),
    ],
    (text) => {
      assert(text.trim().length > 0, 'collections_search: empty response')
    },
  )
}

main().catch((error) => {
  console.error('ERROR:', error.message)
  process.exit(1)
})
