import { expect, test } from '@playwright/test'
import {
  forkWithSourceMessageSnapshot,
  sameSerializableValue,
} from '../src/routes/api.sandbox-file-persistence'

test.describe('sandbox portable file snapshots', () => {
  test('captures source messages before the fork and compares dates', async () => {
    const messages = [{ id: 'message-1', nested: { value: 'before' } }]
    const result = await forkWithSourceMessageSnapshot({
      loadSourceMessages: () => Promise.resolve(messages),
      fork: () => {
        const message = messages[0]
        if (!message) throw new Error('Expected a message')
        message.nested.value = 'after'
        return Promise.resolve()
      },
    })

    expect(result.sourceMessagesUnchanged).toBe(false)
    expect(
      sameSerializableValue(
        { createdAt: new Date('2026-01-01T00:00:00.000Z') },
        { createdAt: new Date('2026-01-02T00:00:00.000Z') },
      ),
    ).toBe(false)
  })

  test('saves, recovers, reads, and forks an immutable snapshot', async ({
    request,
  }) => {
    const response = await request.post('/api/sandbox-file-persistence')

    expect(response.ok()).toBe(true)
    await expect(response.json()).resolves.toEqual({
      namedSave: 'release-1',
      recoveredFiles: ['notes.txt'],
      recoveredFileBytes: [115, 97, 118, 101, 100, 32, 102, 105, 108, 101],
      recoveredEmptyDirectories: ['empty'],
      artifactText: 'artifact data',
      conversation: [{ content: 'saved conversation', role: 'user' }],
      automaticConversation: [
        { content: 'recover', role: 'user' },
        {
          content: 'automatic conversation',
          createdAt: expect.any(String),
          id: 'automatic-message',
          role: 'assistant',
        },
      ],
      excluded: ['.env', '.git'],
      fork: {
        selectedCheckpointIsHead: false,
        files: ['notes.txt'],
        sourceThreadUnchanged: true,
        sourceMessagesUnchanged: true,
        conversation: [{ content: 'saved conversation', role: 'user' }],
      },
    })
  })
})
