import { chat, defineAgent } from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'

export function createBlogAgents(apiKey: string) {
  const researcher = defineAgent({
    name: 'researcher',
    description: 'Looks up facts, sources, and background for a blog post',
    run: (ctx) =>
      chat({
        adapter: createOpenRouterText('openai/gpt-5.5', apiKey),
        messages: ctx.messages,
        threadId: ctx.threadId,
        runId: ctx.runId,
        systemPrompts: [
          'You research for a blog desk. Reply with short notes and sources. Do not write the full post.',
        ],
      }),
  })

  const writer = defineAgent({
    name: 'writer',
    description: 'Drafts or rewrites a blog post',
    run: (ctx) =>
      chat({
        adapter: createOpenRouterText('openai/gpt-5.5', apiKey),
        messages: ctx.messages,
        threadId: ctx.threadId,
        runId: ctx.runId,
        systemPrompts: [
          'You write blog posts. Use a clear title, short sections, and a closing line.',
        ],
      }),
  })

  return [researcher, writer] as const
}
