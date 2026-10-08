import { runInContext, createContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { DASHBOARD_HTML } from '../src/ui'

/** Just enough DOM for the page script: nodes with children and text. */
class FakeNode {
  children: Array<FakeNode> = []
  className = ''
  attributes: Record<string, string> = {}
  constructor(
    readonly tag: string,
    readonly text = '',
  ) {}
  append(...children: Array<FakeNode>) {
    this.children.push(...children)
  }
  replaceChildren(...children: Array<FakeNode>) {
    this.children = children
  }
  setAttribute(key: string, value: string) {
    this.attributes[key] = value
  }
  get textContent(): string {
    return this.text + this.children.map((child) => child.textContent).join('')
  }
}

function loadPage() {
  const script = /<script>([\s\S]*)<\/script>/.exec(DASHBOARD_HTML)?.[1] ?? ''
  const nodes = new Map<string, FakeNode>()
  const context = createContext({
    Node: FakeNode,
    document: {
      createElement: (tag: string) => new FakeNode(tag),
      createTextNode: (text: string) => new FakeNode('#text', text),
      getElementById: (id: string) => {
        if (!nodes.has(id)) nodes.set(id, new FakeNode('div'))
        return nodes.get(id)
      },
    },
    location: { hash: '' },
    history: { replaceState: () => {} },
    localStorage: {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    },
    navigator: {},
    setInterval: () => 0,
    URLSearchParams,
    Map,
    JSON,
  })
  runInContext(script, context)
  runInContext(
    "current = { threadId: 't', messages: [], interrupts: [], questions: new Map(), running: false }",
    context,
  )
  const apply = (event: Record<string, unknown>) =>
    runInContext(
      `apply(${JSON.stringify({ type: 'harness.event', operationId: 'op', event })})`,
      context,
    )
  const messages = (): Array<Record<string, unknown>> =>
    JSON.parse(runInContext('JSON.stringify(current.messages)', context))
  const drawn = () => {
    runInContext('draw()', context)
    return nodes.get('main') ?? new FakeNode('main')
  }
  return { apply, messages, drawn }
}

const child = (event: Record<string, unknown>) => ({
  subagentRunId: 'c1',
  ...event,
})

describe('dashboard child agents', () => {
  it('collects a child agent into one block with its tools and text', () => {
    const page = loadPage()
    page.apply({
      type: 'TEXT_MESSAGE_CONTENT',
      messageId: 'm',
      delta: 'Delegating.',
    })
    page.apply(child({ type: 'SUBAGENT_STARTED', name: 'claude_code' }))
    page.apply(
      child({ type: 'TOOL_CALL_START', toolCallId: 't', toolCallName: 'Edit' }),
    )
    page.apply(
      child({
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'x',
        delta: 'Added a test.',
      }),
    )
    page.apply(child({ type: 'SUBAGENT_FINISHED' }))
    // Events of a child the page never saw start are ignored.
    page.apply({
      subagentRunId: 'other',
      type: 'TEXT_MESSAGE_CONTENT',
      delta: 'lost',
    })

    expect(page.messages()).toEqual([
      { kind: 'assistant', op: 'op', text: 'Delegating.' },
      {
        kind: 'agent',
        name: 'claude_code',
        status: 'done',
        tools: ['Edit'],
        text: 'Added a test.',
      },
    ])
    const block = page
      .drawn()
      .children.flatMap((node) => node.children)
      .find((node) => node.className === 'msg agent done')
    expect(block?.textContent).toBe(
      'agent claude_code (done)tool EditAdded a test.',
    )
  })

  it('marks a failed child and shows its error', () => {
    const page = loadPage()
    page.apply(child({ type: 'SUBAGENT_STARTED' }))
    page.apply(child({ type: 'SUBAGENT_ERROR', message: 'sandbox is down' }))
    expect(page.messages()).toEqual([
      {
        kind: 'agent',
        name: 'agent',
        status: 'failed',
        tools: [],
        text: 'sandbox is down',
      },
    ])
    const block = page
      .drawn()
      .children.flatMap((node) => node.children)
      .find((node) => node.className === 'msg agent failed')
    expect(block?.textContent).toBe('agent agent (failed)sandbox is down')
  })
})
