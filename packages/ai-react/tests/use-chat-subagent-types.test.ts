import { expectTypeOf, it } from 'vitest'
import { defineAgent, toolDefinition } from '@tanstack/ai'
import { useChat } from '../src/use-chat'

it('useChat types subagent parts from the server agents', () => {
  const check = () => {
    const lookup = toolDefinition({
      name: 'lookup',
      description: 'Look up a fact',
    }).client(() => ({ ok: true as const }))

    const researcher = defineAgent({
      name: 'researcher',
      description: 'Looks up facts',
      tools: [lookup],
      run: async function* () {},
    })
    const writer = defineAgent({
      name: 'writer',
      description: 'Writes the draft',
      run: async function* () {},
    })

    const chat = useChat({
      threadId: 'thread-1',
      connection: { connect: async function* () {} },
      subagents: [researcher, writer],
    })

    expectTypeOf(chat.subagents[0]!.name).toEqualTypeOf<
      'researcher' | 'writer'
    >()

    const part = chat.messages[0]?.parts[0]
    if (part?.type !== 'subagent') return
    expectTypeOf(part.subagent.name).toEqualTypeOf<'researcher' | 'writer'>()
    if (part.subagent.name !== 'researcher') return
    const child = part.subagent.messages[0]?.parts[0]
    if (child?.type !== 'tool-call') return
    expectTypeOf(child.name).toEqualTypeOf<'lookup'>()
  }
  void check
})

it('types part.subagent.input from the agent inputSchema', () => {
  const check = () => {
    const inputSchema = {
      '~standard': {
        version: 1 as const,
        vendor: 'test',
        types: { input: { task: '' }, output: { task: '' } },
        validate: () => ({ value: { task: '' } }),
        jsonSchema: {
          input: () => ({
            type: 'object',
            properties: { task: { type: 'string' } },
          }),
          output: () => ({}),
        },
      },
    }
    const researcher = defineAgent({
      name: 'researcher',
      description: 'Looks up facts',
      inputSchema,
      run: async function* () {},
    })
    const writer = defineAgent({
      name: 'writer',
      description: 'Writes the draft',
      run: async function* () {},
    })

    const chat = useChat({
      threadId: 'thread-1',
      connection: { connect: async function* () {} },
      subagents: [researcher, writer],
    })

    const part = chat.messages[0]?.parts[0]
    if (part?.type !== 'subagent') return
    if (part.subagent.name === 'researcher') {
      expectTypeOf(part.subagent.input).toEqualTypeOf<
        { task: string } | undefined
      >()
    } else {
      expectTypeOf(part.subagent.input).toEqualTypeOf<undefined>()
    }
  }
  void check
})
