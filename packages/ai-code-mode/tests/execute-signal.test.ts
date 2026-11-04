import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { createCodeModeTool } from '../src/create-code-mode-tool'
import type { IsolateContext, IsolateDriver } from '../src/types'

function setup() {
  const context: IsolateContext = {
    execute: vi.fn().mockResolvedValue({ success: true, value: 1, logs: [] }),
    dispose: vi.fn().mockResolvedValue(undefined),
  }
  const driver: IsolateDriver = {
    createContext: vi.fn().mockResolvedValue(context),
  }
  const tool = createCodeModeTool({
    driver,
    tools: [
      toolDefinition({
        name: 'lookup',
        description: 'Look up a value',
        inputSchema: z.object({ q: z.string() }),
      }).server(async () => 'x'),
    ],
  })
  return { tool, context }
}

describe('execute_typescript passes the tool signal to the isolate', () => {
  it('forwards context.abortSignal to execute()', async () => {
    const { tool, context } = setup()
    const controller = new AbortController()
    await tool.execute!(
      { typescriptCode: 'return 1' },
      { abortSignal: controller.signal, emitCustomEvent() {} },
    )
    expect(context.execute).toHaveBeenCalledWith(expect.any(String), {
      signal: controller.signal,
    })
  })

  it('calls execute() with the code only when there is no signal', async () => {
    const { tool, context } = setup()
    await tool.execute!({ typescriptCode: 'return 1' })
    expect(vi.mocked(context.execute).mock.calls[0]).toHaveLength(1)
  })
})
