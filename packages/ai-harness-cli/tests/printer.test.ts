import { describe, expect, it } from 'vitest'
import { createPrinter } from '../src/printer'
import type { SessionViewState } from '@tanstack/ai-harness/view'

const base: SessionViewState = {
  threadId: 't',
  status: 'idle',
  connection: 'open',
  messages: [],
  approvals: [],
  clientTools: [],
  questions: [],
  signIns: [],
  agents: [],
  queuedTurns: 0,
  waitingInputs: [],
  commands: [],
  config: [],
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
})
