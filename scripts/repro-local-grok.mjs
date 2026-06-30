import * as fsp from 'node:fs/promises'
import { chat } from '@tanstack/ai'
import { grokBuildText } from '@tanstack/ai-grok-build'
import {
  withSandbox,
  defineSandbox,
  defineWorkspace,
} from '@tanstack/ai-sandbox'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'

const threadId = 'repro-' + Date.now()
const provider = localProcessSandbox()
const sandbox = defineSandbox({
  id: `repro-local-grok-${threadId}`,
  provider,
  workspace: defineWorkspace({ source: { type: 'none' } }),
  lifecycle: { reuse: 'thread' },
})

const adapter = grokBuildText('grok-build-0.1', {
  protocol: 'acp',
  transport: 'auto',
})

const chunks = []
try {
  for await (const chunk of chat({
    threadId,
    adapter,
    messages: [{ role: 'user', content: 'Reply with exactly: pong' }],
    middleware: [withSandbox(sandbox)],
  })) {
    chunks.push(chunk)
    if (chunk.type === 'RUN_ERROR') {
      console.error('RUN_ERROR:', JSON.stringify(chunk, null, 2))
    }
    if (chunk.type === 'TEXT_MESSAGE_CONTENT') {
      process.stdout.write(chunk.delta ?? '')
    }
  }
} catch (err) {
  console.error('FATAL:', err)
}

console.log('\n--- chunk types ---')
console.log(chunks.map((c) => c.type).join(', '))
