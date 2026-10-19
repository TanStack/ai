import { describe, expect, it, vi } from 'vitest'
import { createPrinter } from '../src/printer'
import type { SessionViewState, ViewPart } from '@tanstack/ai-harness/view'

const base: SessionViewState = {
  threadId: 't',
  status: 'idle',
  connection: 'open',
  messages: [],
  approvals: [],
  clientTools: [],
  interrupts: [],
  questions: [],
  signIns: [],
  waits: [],
  agents: [],
  queuedTurns: 0,
  waitingInputs: [],
  commands: [],
  config: [],
  models: [],
  tools: [],
  plugins: {},
}

describe('line printer', () => {
  it('streams text growth, prints each item once, and breaks lines between turns', () => {
    let out = ''
    const printer = createPrinter((text) => (out += text))
    printer.print({
      ...base,
      messages: [
        {
          id: 'turn-1',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Hel' }],
        },
      ],
    })
    printer.print({
      ...base,
      messages: [
        {
          id: 'turn-1',
          role: 'assistant',
          parts: [
            { type: 'text', text: 'Hello' },
            {
              type: 'tool-call',
              id: 'c',
              name: 'read',
              argsText: '{}',
              args: {},
              status: 'done',
            },
            {
              type: 'agent',
              id: 'a',
              name: 'helper',
              status: 'done',
              parts: [
                { type: 'text', text: 'child says hi' },
                {
                  type: 'tool-call',
                  id: 'd',
                  name: 'Edit',
                  argsText: '',
                  args: undefined,
                  status: 'done',
                },
              ],
            },
          ],
        },
        { id: 'notice-1', role: 'notice', kind: 'error', text: 'Error: boom' },
        {
          id: 'notice-2',
          role: 'notice',
          kind: 'command',
          text: 'printed by handleLine',
        },
        {
          id: 'turn-2',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Second.' }],
        },
      ],
      questions: [
        {
          id: 'q',
          message: 'Really?',
          answer: async () => ({ inputId: 'i', status: 'accepted' }),
        },
      ],
      signIns: [{ connector: 'notion', url: 'https://x' }],
    })
    printer.end()

    expect(out).toBe(
      [
        'Hello',
        '[tool read]',
        '[agent helper started]',
        '[helper: tool Edit]',
        '[agent helper finished: child says hi]',
        '[Error: boom]',
        'Second.',
        '[? Really?]',
        '[Sign in to notion. Open https://x.]',
        '',
      ].join('\n'),
    )
  })

  it('cuts long child answers, reports failed children, and prints each kind of sign-in', () => {
    let out = ''
    const printer = createPrinter((text) => (out += text))
    printer.print({
      ...base,
      messages: [
        { id: 'user-1', role: 'user', text: 'hi' },
        {
          id: 'turn-1',
          role: 'assistant',
          parts: [
            { type: 'reasoning', text: 'thinking' },
            {
              type: 'agent',
              id: 'a',
              name: 'codex',
              status: 'done',
              parts: [{ type: 'text', text: 'word '.repeat(60) }],
            },
            {
              type: 'agent',
              id: 'b',
              name: 'painter',
              status: 'failed',
              error: 'crashed',
              parts: [],
            },
            {
              type: 'agent',
              id: 'c',
              name: 'quiet',
              status: 'done',
              parts: [],
            },
          ],
        },
        {
          id: 'notice-1',
          role: 'notice',
          kind: 'info',
          text: 'Resumed a turn that a crash stopped.',
        },
        {
          id: 'notice-2',
          role: 'notice',
          kind: 'rejected',
          text: 'Not accepted: busy',
        },
      ],
      signIns: [
        { connector: 'gh', url: 'https://gh.example/device', userCode: 'ABCD' },
        { connector: 'svc' },
      ],
    })

    expect(out).toBe(
      [
        '[agent codex started]',
        `[agent codex finished: ${'word '.repeat(40)}...]`,
        '[agent painter started]',
        '[agent painter failed: crashed]',
        '[agent quiet started]',
        '[agent quiet finished]',
        '[Resumed a turn that a crash stopped.]',
        '[Sign in to gh. Open https://gh.example/device and enter the code ABCD.]',
        '[Sign in to svc. Run /connect svc.]',
        '',
      ].join('\n'),
    )
  })

  it('does not print what mark() saw', () => {
    let out = ''
    const printer = createPrinter((text) => (out += text))
    const old: SessionViewState = {
      ...base,
      messages: [
        {
          id: 'history-0',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Old.' }],
        },
      ],
    }
    printer.mark(old)
    printer.print(old)
    printer.line('new line')
    expect(out).toBe('new line\n')
  })

  it('does not print the saved parts of a finished child that load after mark()', () => {
    let out = ''
    const onMedia = vi.fn()
    const printer = createPrinter((text) => (out += text), { onMedia })
    const withChild = (parts: Array<ViewPart>): SessionViewState => ({
      ...base,
      messages: [
        {
          id: 'history-0',
          role: 'assistant',
          parts: [
            { type: 'agent', id: 'a', name: 'painter', status: 'done', parts },
          ],
        },
      ],
    })
    printer.mark(withChild([]))
    printer.print(
      withChild([
        {
          type: 'tool-call',
          id: 'd',
          name: 'paint',
          argsText: '{}',
          args: {},
          status: 'done',
        },
        {
          type: 'media',
          id: 'm-1',
          kind: 'image',
          mimeType: 'image/png',
          name: 'old.png',
          size: 3,
          load: async () => new Uint8Array(),
        },
      ]),
    )
    expect(out).toBe('')
    expect(onMedia).not.toHaveBeenCalled()
  })

  it('walks only new messages and parts, and writes only the new text', () => {
    const writes: Array<string> = []
    const printer = createPrinter((text) => writes.push(text))
    let reads = 0
    const oldParts: Array<ViewPart> = [{ type: 'text', text: 'Old.' }]
    const old = {
      id: 'turn-0',
      role: 'assistant' as const,
      get parts() {
        reads += 1
        return oldParts
      },
    }
    const tool: ViewPart = {
      type: 'tool-call',
      id: 'c',
      name: 'read',
      argsText: '{}',
      args: {},
      status: 'done',
    }
    const turn = (text: string) => ({
      id: 'turn-1',
      role: 'assistant' as const,
      parts: [tool, { type: 'text' as const, text }],
    })

    printer.print({ ...base, messages: [old] })
    printer.print({ ...base, messages: [old, turn('Hi')] })
    printer.print({ ...base, messages: [old, turn('Hi there')] })

    expect(writes).toEqual(['Old.', '\n', '[tool read]\n', 'Hi', ' there'])
    expect(reads).toBe(1)
  })
})
