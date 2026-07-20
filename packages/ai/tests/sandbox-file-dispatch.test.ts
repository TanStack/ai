import { describe, expect, it } from 'vitest'
import { MiddlewareRunner } from '../src/activities/chat/middleware/compose'
import { resolveDebugOption } from '../src/logger/resolve'
import type {
  ChatMiddleware,
  ChatMiddlewareContext,
  SandboxFileHookEvent,
} from '../src/activities/chat/middleware/types'

const ctx = {} as ChatMiddlewareContext
const ev = (type: SandboxFileHookEvent['type']): SandboxFileHookEvent => ({
  type,
  path: `/workspace/a-${type}.ts`,
  timestamp: 1,
  before: async () => '',
  after: async () => '',
  diff: async () => '',
})

describe('MiddlewareRunner.runSandboxFile', () => {
  it('calls onFile (catch-all) + the type-specific hook, in array order', async () => {
    const calls: Array<string> = []
    const mws: Array<ChatMiddleware> = [
      {
        name: 'a',
        sandbox: {
          onFile: () => void calls.push('a:onFile'),
          onFileCreate: () => void calls.push('a:onFileCreate'),
          onFileChange: () => void calls.push('a:onFileChange'),
        },
      },
      { name: 'b', sandbox: { onFile: () => void calls.push('b:onFile') } },
    ]
    const runner = new MiddlewareRunner(mws, resolveDebugOption(false))
    await runner.runSandboxFile(ctx, ev('create'))
    expect(calls).toEqual(['a:onFile', 'a:onFileCreate', 'b:onFile'])
  })

  it('isolates hook errors (one throwing does not stop the rest)', async () => {
    const calls: Array<string> = []
    const mws: Array<ChatMiddleware> = [
      {
        name: 'a',
        sandbox: {
          onFileDelete: () => {
            throw new Error('boom')
          },
        },
      },
      { name: 'b', sandbox: { onFileDelete: () => void calls.push('b') } },
    ]
    const runner = new MiddlewareRunner(mws, resolveDebugOption(false))
    await runner.runSandboxFile(ctx, ev('delete'))
    expect(calls).toEqual(['b'])
  })
})
