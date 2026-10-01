import { describe, expect, it } from 'vitest'
import {
  aguiSnapshotMessageToUIMessage,
  convertMessagesToModelMessages,
  modelMessagesToUIMessages,
} from '../src/activities/chat/messages'
import { uiMessagesToWire } from '../src/utilities/ag-ui-wire'
import { chatParamsFromRequestBody } from '../src/utilities/chat-params'
import type { ModelMessage } from '../src/types'

const stored: Array<ModelMessage> = [
  { role: 'user', content: 'Hi' },
  {
    role: 'assistant',
    content: 'Hello.',
    thinking: [
      { content: '', signature: 'opaque-1', redacted: true },
      { content: 'I greet back.', signature: 'sig-2' },
    ],
  },
]

function thinkingOf(messages: Array<ModelMessage>) {
  return messages.find((message) => message.role === 'assistant')?.thinking
}

describe('redacted thinking', () => {
  it('survives a stored thread that is loaded into the UI and sent back', () => {
    const ui = modelMessagesToUIMessages(stored)

    expect(thinkingOf(convertMessagesToModelMessages(ui))).toEqual([
      { content: '', signature: 'opaque-1', redacted: true },
      { content: 'I greet back.', signature: 'sig-2' },
    ])
  })

  it('survives the wire from the client to the server', async () => {
    const wire = uiMessagesToWire(modelMessagesToUIMessages(stored))
    // `JSON.parse(JSON.stringify(...))` stands in for the HTTP hop.
    const params = await chatParamsFromRequestBody({
      threadId: 'thread-1',
      runId: 'run-1',
      messages: JSON.parse(JSON.stringify(wire)),
      tools: [],
      context: [],
    })

    expect(thinkingOf(convertMessagesToModelMessages(params.messages))).toEqual(
      [
        { content: '', signature: 'opaque-1', redacted: true },
        { content: 'I greet back.', signature: 'sig-2' },
      ],
    )
  })

  it('survives an interrupt snapshot that the client loads', () => {
    const wire = uiMessagesToWire(modelMessagesToUIMessages(stored))

    const parts = wire
      .filter((message) => message.role === 'reasoning')
      .flatMap((message) => aguiSnapshotMessageToUIMessage(message).parts)

    expect(parts).toEqual([
      { type: 'thinking', content: '', signature: 'opaque-1', redacted: true },
      { type: 'thinking', content: 'I greet back.', signature: 'sig-2' },
    ])
  })
})
