import { describe, expect, it, vi } from 'vitest'
import { inMemoryRunStore, runWorkflow } from '@tanstack/ai-orchestration'
import { articleWorkflow } from './article-workflow'

const mocks = vi.hoisted(() => ({
  chat: vi.fn(),
}))

vi.mock('@tanstack/ai', () => ({
  chat: mocks.chat,
}))

vi.mock('@tanstack/ai-openai', () => ({
  openaiText: vi.fn(() => ({ provider: 'mock-openai' })),
}))

describe('articleWorkflow', () => {
  it('revises the article when the skeptic returns findings, then reviews the revision', async () => {
    mocks.chat.mockImplementation((request: ChatRequest) => {
      const prompt = request.systemPrompts.at(0) ?? ''
      const content = request.messages
        .map((message) => message.content)
        .join('\n')

      if (prompt.includes('non-fiction writer')) {
        return {
          title: 'Pufferfish Around the World',
          paragraphs: [
            'Pufferfish appear in rituals and remedies without citations.',
            'The draft makes broad cultural claims.',
            'It needs substantiation before publication.',
          ],
        }
      }

      if (prompt.includes('legal reviewer')) {
        return { verdict: 'pass', findings: [] }
      }

      if (prompt.includes('skeptic')) {
        if (content.includes('source-backed')) {
          return { verdict: 'pass', findings: [] }
        }

        return {
          verdict: 'block',
          findings: ['Add citations for non-Japan cultural claims.'],
        }
      }

      if (prompt.includes('editor')) {
        return {
          title: 'Source-Backed Pufferfish Notes',
          paragraphs: [
            'This source-backed revision narrows the cultural claims.',
            'Unsupported regional examples are removed.',
            'The article now distinguishes evidence from uncertainty.',
          ],
        }
      }

      throw new Error(`Unexpected prompt: ${prompt}`)
    })

    const events = await collect(
      runWorkflow({
        workflow: articleWorkflow,
        input: { topic: 'pufferfish cultural history' },
        runStore: inMemoryRunStore(),
      }),
    )

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'STEP_FINISHED',
          stepName: 'editor',
          content: expect.objectContaining({
            title: 'Source-Backed Pufferfish Notes',
          }),
        }),
        expect.objectContaining({
          type: 'CUSTOM',
          name: 'approval-requested',
        }),
      ]),
    )

    expect(
      events.filter(
        (event) =>
          event.type === 'STEP_FINISHED' && event.stepName === 'skeptic',
      ),
    ).toHaveLength(2)
  })
})

interface ChatRequest {
  systemPrompts: Array<string>
  messages: Array<{ content: string }>
}

async function collect<T>(iter: AsyncIterable<T>): Promise<Array<T>> {
  const out: Array<T> = []
  for await (const chunk of iter) {
    out.push(chunk)
  }
  return out
}
