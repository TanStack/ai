import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { chat } from '../src'
import { createMockAdapter, ev, serverTool } from './test-utils'
import type { ChatMiddleware, ToolChoice } from '../src'

const toolTurn = (toolCallId: string) => [
  ev.runStarted(),
  ev.toolStart(toolCallId, 'lookup'),
  ev.toolArgs(toolCallId, '{}'),
  ev.toolEnd(toolCallId),
  ev.runFinished('tool_calls'),
]

const stopTurn = [
  ev.runStarted(),
  ev.textContent('Done'),
  ev.runFinished('stop'),
]

const lookup = serverTool('lookup', () => ({ ok: true }))

/** Forces the `lookup` tool at the second model call only. */
const lookupAtSecondCall: ChatMiddleware = {
  name: 'lookup-at-second-call',
  onConfig: (ctx) =>
    ctx.phase === 'beforeModel' && ctx.iteration === 1
      ? { toolChoice: { type: 'tool', name: 'lookup' } }
      : undefined,
}

/** Run one chat() call with tools and three model calls. Give back each call's toolChoice. */
async function toolChoiceOfThreeCalls(options: {
  toolChoice: ToolChoice
  middleware?: Array<ChatMiddleware>
}) {
  const { adapter, calls } = createMockAdapter({
    iterations: [toolTurn('tc-1'), toolTurn('tc-2'), stopTurn],
  })
  await chat({
    adapter,
    messages: [{ role: 'user', content: 'Hi' }],
    tools: [lookup],
    stream: false,
    ...options,
  })
  return calls.map((call) => call.toolChoice)
}

describe('chat({ toolChoice })', () => {
  it('sends the chat() option on every model call', async () => {
    const seen = await toolChoiceOfThreeCalls({ toolChoice: 'required' })
    expect(seen).toStrictEqual(['required', 'required', 'required'])
  })

  it('lets onConfig change it for one model call only', async () => {
    const seen = await toolChoiceOfThreeCalls({
      toolChoice: 'auto',
      middleware: [lookupAtSecondCall],
    })
    expect(seen).toStrictEqual([
      'auto',
      { type: 'tool', name: 'lookup' },
      'auto',
    ])
  })

  it('sends no toolChoice on a call with no tools', async () => {
    const { adapter, calls } = createMockAdapter({ iterations: [stopTurn] })
    await chat({
      adapter,
      messages: [{ role: 'user', content: 'Hi' }],
      toolChoice: 'required',
      stream: false,
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]).not.toHaveProperty('toolChoice')
  })

  it('keeps it out of the structured-output call and its middleware view', async () => {
    let callHasToolChoice: boolean | undefined
    let viewHasToolChoice: boolean | undefined
    const { adapter, calls } = createMockAdapter({
      iterations: [stopTurn],
      structuredOutput: async (options) => {
        callHasToolChoice = 'toolChoice' in options.chatOptions
        return { data: { name: 'Ada' }, rawText: '{"name":"Ada"}' }
      },
    })
    const result = await chat({
      adapter,
      messages: [{ role: 'user', content: 'Who?' }],
      tools: [lookup],
      toolChoice: 'required',
      outputSchema: z.object({ name: z.string() }),
      middleware: [
        {
          name: 'structured-view-recorder',
          onStructuredOutputConfig: (_ctx, config) => {
            viewHasToolChoice = 'toolChoice' in config
          },
        },
      ],
    })
    expect(result).toEqual({ name: 'Ada' })
    // The agent-loop call had it, so the option was on for this run.
    expect(calls[0]?.toolChoice).toBe('required')
    expect({ callHasToolChoice, viewHasToolChoice }).toStrictEqual({
      callHasToolChoice: false,
      viewHasToolChoice: false,
    })
  })
})
