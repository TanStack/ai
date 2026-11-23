import { createFileRoute } from '@tanstack/react-router'
import { EventType, chat, toolDefinition } from '@tanstack/ai'
import { claudeCodeText } from '@tanstack/ai-claude-code'
import { defineSandbox, fileSkill, withSandbox } from '@tanstack/ai-sandbox'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import { deployProgress } from '@/lib/activity-types'
import type { ActivitySnapshotEvent } from '@tanstack/ai'

/**
 * An activity of a bridged tool gets to the `chat()` stream of a real harness
 * adapter.
 *
 * `claudeCodeText` runs in a local-process sandbox. The sandbox has a fake
 * `claude` program, so the run needs no LLM and no aimock fixture. The fake
 * calls the `deploy` tool one time over the sandbox tool bridge. The tool
 * sends a `deploy.progress` activity with the id `bridge-1`.
 *
 * The answer is JSON: the ACTIVITY_SNAPSHOT chunks and the RUN_ERROR
 * messages of the run.
 */

// The fake `claude`. It reads the bridge URL and token from the file after
// `--mcp-config`. Then it sends one MCP `tools/call` for `deploy` and writes
// the stream-json lines of a short turn. If the call fails, the process fails,
// so the run gets a RUN_ERROR with the answer of the bridge.
const FAKE_CLAUDE = `
import { readFileSync } from 'node:fs'

process.stdin.resume()
process.stdin.on('end', async () => {
  const write = (line) => process.stdout.write(JSON.stringify(line) + '\\n')
  write({ type: 'system', subtype: 'init', session_id: 'fake-session', model: 'haiku', tools: [] })
  const configFile = process.argv[process.argv.indexOf('--mcp-config') + 1]
  const bridge = JSON.parse(readFileSync(configFile, 'utf8')).mcpServers.tanstack
  const response = await fetch(bridge.url, {
    method: 'POST',
    headers: {
      ...bridge.headers,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'deploy', arguments: {} },
    }),
  })
  const answer = await response.text()
  if (!answer.includes('deployed')) {
    throw new Error('bridge answered ' + response.status + ': ' + answer)
  }
  write({ type: 'assistant', message: { id: 'fake-message', content: [{ type: 'text', text: 'deployed' }] }, parent_tool_use_id: null })
  write({ type: 'result', subtype: 'success', result: 'deployed', usage: { input_tokens: 1, output_tokens: 1 } })
})
`

const sandbox = defineSandbox({
  id: 'bridge-activity',
  provider: localProcessSandbox(),
  workspace: {
    source: { type: 'none' },
    // The workspace holds the fake, as a sandbox image holds the real CLI.
    skills: [fileSkill({ path: 'fake-claude.mjs', content: FAKE_CLAUDE })],
  },
  lifecycle: { reuse: 'none', snapshot: 'none', destroyOnComplete: true },
  fileEvents: false,
})

// The fake calls this app tool over the bridge. The bridge gives the tool
// `context.emitActivity`, which puts the activity on the adapter stream.
const deployTool = toolDefinition({
  name: 'deploy',
  description: 'Deploy the app.',
}).server((_args, context) => {
  context?.emitActivity?.(deployProgress, 'bridge-1', { step: 1, total: 1 })
  return 'deployed'
})

export const Route = createFileRoute('/api/sandbox-bridge-activity')({
  server: {
    handlers: {
      POST: async () => {
        const stream = chat({
          adapter: claudeCodeText('haiku', {
            claudeExecutable: 'node fake-claude.mjs',
            emitDiff: false,
          }),
          messages: [{ role: 'user', content: 'Deploy the app.' }],
          tools: [deployTool],
          threadId: 'sandbox-bridge-activity',
          middleware: [withSandbox(sandbox)],
        })
        // The ACTIVITY_SNAPSHOT chunks of the run, in stream order.
        const activities: Array<
          Pick<ActivitySnapshotEvent, 'messageId' | 'activityType' | 'content'>
        > = []
        const errors: Array<string> = []
        for await (const chunk of stream) {
          if (chunk.type === EventType.ACTIVITY_SNAPSHOT)
            activities.push({
              messageId: chunk.messageId,
              activityType: chunk.activityType,
              content: chunk.content,
            })
          else if (chunk.type === EventType.RUN_ERROR)
            errors.push(chunk.message)
        }
        return Response.json({ activities, errors })
      },
    },
  },
})
