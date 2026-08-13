import { describe, expect, it } from 'vitest'
import {
  hasStructuredOutputPreview,
  mergePreviewMessagesForUserView,
  partsToMessageText,
  visiblePreviewPartsForMessage,
} from '../src/components/hooks/preview-messages'

describe('preview message merging', () => {
  it('does not duplicate normal client snapshot messages when a server conversation exists', () => {
    const conversationMessages = [
      { id: 'server-user', role: 'user', content: 'recommend a guitar' },
      {
        id: 'server-tool-call',
        role: 'assistant',
        content: '',
        parts: [{ id: 'tool-call:server-call', kind: 'tool-call' }],
      },
    ]
    const snapshotMessages = [
      { id: 'client-user', role: 'user', content: 'recommend a guitar' },
      {
        id: 'client-tool-call',
        role: 'assistant',
        content: '',
        parts: [{ id: 'tool-call:client-call', kind: 'tool-call' }],
      },
      {
        id: 'fixture-msg-1',
        role: 'assistant',
        content: '',
        parts: [
          {
            id: 'tool-call:fixture-tool-call-1',
            kind: 'tool-call',
          },
        ],
      },
    ]

    expect(
      mergePreviewMessagesForUserView(conversationMessages, snapshotMessages),
    ).toEqual([
      conversationMessages[0],
      conversationMessages[1],
      snapshotMessages[2],
    ])
  })

  it('does not render tool parts as fallback message text', () => {
    expect(
      partsToMessageText([
        { type: 'tool-call', name: 'recommendGuitar' },
        { type: 'tool-result', content: 'null' },
      ]),
    ).toBe('')
    expect(
      partsToMessageText([
        { type: 'text', content: 'recommend a guitar' },
        { type: 'tool-call', name: 'recommendGuitar' },
      ]),
    ).toBe('recommend a guitar')
  })

  it('prefers client snapshot messages when they resolve the same conversation message', () => {
    type TestPreviewMessage = {
      id: string
      role: string
      content: string
      parts: Array<{ id: string; kind: string; output?: unknown }>
    }

    const conversationMessages: Array<TestPreviewMessage> = [
      {
        id: 'assistant-message',
        role: 'assistant',
        content: '',
        parts: [
          {
            id: 'tool-call:recommendGuitar',
            kind: 'tool-call',
          },
        ],
      },
    ]
    const snapshotMessages: Array<TestPreviewMessage> = [
      {
        id: 'assistant-message',
        role: 'assistant',
        content: '',
        parts: [
          {
            id: 'tool-call:recommendGuitar',
            kind: 'tool-call',
            output: { id: 4 },
          },
        ],
      },
    ]

    expect(
      mergePreviewMessagesForUserView(conversationMessages, snapshotMessages),
    ).toEqual(snapshotMessages)
  })

  it('includes snapshot assistant messages when the conversation only has a user message', () => {
    const conversationMessages = [
      { id: 'server-user', role: 'user', content: 'recommend a guitar' },
    ]
    const snapshotMessages = [
      { id: 'client-user', role: 'user', content: 'recommend a guitar' },
      {
        id: 'client-tool-call',
        role: 'assistant',
        content: '',
        parts: [{ id: 'tool-call:client-call', kind: 'tool-call' }],
      },
      {
        id: 'client-tool-result',
        role: 'tool',
        content: '',
        parts: [{ id: 'tool-result:client-call', kind: 'tool-result' }],
      },
    ]

    expect(
      mergePreviewMessagesForUserView(conversationMessages, snapshotMessages),
    ).toEqual([
      conversationMessages[0],
      snapshotMessages[1],
      snapshotMessages[2],
    ])
  })

  it('filters empty preview messages', () => {
    expect(
      mergePreviewMessagesForUserView(
        [
          { id: 'message-1', role: 'assistant', content: '', parts: [] },
          {
            id: 'message-2',
            role: 'assistant',
            content: '',
            parts: [{ id: 'tool-call:server-call', kind: 'tool-call' }],
          },
        ],
        [
          {
            id: 'fixture-msg-1',
            role: 'assistant',
            content: '',
            parts: [
              {
                id: 'tool-call:fixture-tool-call-1',
                kind: 'tool-call',
              },
            ],
          },
        ],
      ),
    ).toEqual([
      {
        id: 'message-2',
        role: 'assistant',
        content: '',
        parts: [{ id: 'tool-call:server-call', kind: 'tool-call' }],
      },
      {
        id: 'fixture-msg-1',
        role: 'assistant',
        content: '',
        parts: [
          {
            id: 'tool-call:fixture-tool-call-1',
            kind: 'tool-call',
          },
        ],
      },
    ])
  })

  it('omits text parts that duplicate the rendered message content', () => {
    const duplicateText = {
      id: '0:text',
      kind: 'text',
      content: 'Pasta dinner for two',
    }
    const toolPart = {
      id: 'tool-call:getRecipe',
      kind: 'tool-call',
      content: '{}',
    }

    const message = {
      id: 'message-1',
      role: 'user',
      content: 'Pasta dinner for two',
      parts: [duplicateText, toolPart],
    }

    expect(visiblePreviewPartsForMessage(message)).toEqual([toolPart])
  })

  it('detects structured output previews for layout decisions', () => {
    expect(
      hasStructuredOutputPreview([
        {
          id: 'message-1',
          role: 'assistant',
          content: '',
          parts: [
            { id: 'structured-output:message-1', kind: 'structured-output' },
          ],
        },
      ]),
    ).toBe(true)
  })
})
