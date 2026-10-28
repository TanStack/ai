import { describe, expect, it, vi } from 'vitest'
import { askForInput, elicitFor, trackCaller } from '../src/harness-plugin'
import type { AnyTool } from '@tanstack/ai'
import type { PluginSessionApi, RunContext } from '@tanstack/ai-harness'

const form = {
  mode: 'form',
  message: 'Which city?',
  requestedSchema: {
    type: 'object',
    properties: { city: { type: 'string' } },
    required: ['city'],
  },
}

/** A session API whose `ask` answers `answer`. Only `ask` is real. */
function askingSession(answer: unknown) {
  const ask = vi.fn(() => Promise.resolve(answer))
  return { session: { ask } as unknown as PluginSessionApi, ask }
}

/** The run of a tool call, as the harness gives it in `ctx.context.run`. */
function runOf(runId: string) {
  return {
    runId,
    signal: new AbortController().signal,
    user: { id: 'user-1' },
  } as unknown as RunContext
}

/** A tool whose `execute` runs `body` with the context it gets. */
function toolWith(body: (context: any) => Promise<unknown>): AnyTool {
  return {
    name: 'book',
    description: 'Book a trip',
    execute: (_args: unknown, context: unknown) => body(context),
  } as unknown as AnyTool
}

describe('an MCP elicitation is a live wait of the run that calls', () => {
  it('asks a spec 2026 elicitation as a wait of the run of the tool call', async () => {
    const { session, ask } = askingSession({ city: 'Paris' })
    const run = runOf('op-chat-1')
    const [tool] = askForInput(
      [toolWith((context) => context.askInput(form))],
      session,
    )

    await expect(
      tool?.execute?.({}, { context: { run } } as never),
    ).resolves.toEqual({ status: 'resolved', payload: { city: 'Paris' } })
    expect(ask).toHaveBeenCalledWith({
      message: 'Which city?',
      schema: form.requestedSchema,
      live: { name: 'mcp-elicitation', run },
    })
  })

  it('asks a spec 2025 elicitation as a wait of the run of the running call', async () => {
    const { session, ask } = askingSession({ city: 'Paris' })
    const calling: Parameters<typeof trackCaller>[2] = []
    const onElicit = elicitFor(calling)
    const run = runOf('op-agent-1')
    const [tool] = trackCaller(
      [toolWith(() => onElicit(form as never))],
      session,
      calling,
    )

    await expect(
      tool?.execute?.({}, { context: { run } } as never),
    ).resolves.toEqual({ action: 'accept', content: { city: 'Paris' } })
    expect(ask).toHaveBeenCalledWith(
      expect.objectContaining({ live: { name: 'mcp-elicitation', run } }),
    )
    expect(calling).toEqual([])
  })

  it('declines an elicitation of a call that has no run, and asks nobody', async () => {
    const { session, ask } = askingSession({ city: 'Paris' })
    const [tool] = askForInput(
      [toolWith((context) => context.askInput(form))],
      session,
    )

    await expect(tool?.execute?.({}, {} as never)).resolves.toEqual({
      status: 'resolved',
      payload: { action: 'decline' },
    })
    expect(ask).not.toHaveBeenCalled()
  })

  it('declines a spec 2025 elicitation while calls of two runs share the server, and asks nobody', async () => {
    const first = askingSession({ city: 'Paris' })
    const second = askingSession({ city: 'Rome' })
    const calling: Parameters<typeof trackCaller>[2] = [
      { session: first.session, run: runOf('op-user-a') },
      { session: second.session, run: runOf('op-user-b') },
    ]

    await expect(elicitFor(calling)(form as never)).resolves.toEqual({
      action: 'decline',
    })
    expect(first.ask).not.toHaveBeenCalled()
    expect(second.ask).not.toHaveBeenCalled()
  })

  it('asks a spec 2025 elicitation when every running call is of one run', async () => {
    const { session, ask } = askingSession({ city: 'Paris' })
    const run = runOf('op-chat-1')
    const calling: Parameters<typeof trackCaller>[2] = [
      { session, run },
      { session, run },
    ]

    await expect(elicitFor(calling)(form as never)).resolves.toEqual({
      action: 'accept',
      content: { city: 'Paris' },
    })
    expect(ask).toHaveBeenCalledTimes(1)
  })

  it('declines a spec 2025 elicitation that comes when no call runs', async () => {
    const onElicit = elicitFor([])
    await expect(onElicit(form as never)).resolves.toEqual({
      action: 'decline',
    })
  })
})
