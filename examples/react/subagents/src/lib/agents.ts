import { chat, defineAgent } from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { researcher, seo, writer } from '@/lib/blog-agents'

function linkAbort(signal: AbortSignal | undefined) {
  const abortController = new AbortController()
  if (signal === undefined) return abortController
  if (signal.aborted) {
    abortController.abort()
    return abortController
  }
  signal.addEventListener(
    'abort',
    () => {
      abortController.abort()
    },
    { once: true },
  )
  return abortController
}

export function createBlogAgents(apiKey: string) {
  const researcherAgent = defineAgent({
    ...researcher,
    run: (ctx) =>
      chat({
        adapter: createOpenRouterText('openai/gpt-5.5', apiKey),
        messages: ctx.messages,
        threadId: ctx.threadId,
        runId: ctx.runId,
        parentRunId: ctx.parentRunId,
        subagentRunId: ctx.subagentRunId,
        resume: ctx.resume,
        abortController: linkAbort(ctx.abortSignal),
        systemPrompts: [
          'You research for a blog desk. Reply in Markdown with short notes and sources. Use a list. Do not write the full post.',
        ],
      }),
  })

  const writerAgent = defineAgent({
    ...writer,
    run: (ctx) =>
      chat({
        adapter: createOpenRouterText('openai/gpt-5.5', apiKey),
        messages: ctx.messages,
        threadId: ctx.threadId,
        runId: ctx.runId,
        parentRunId: ctx.parentRunId,
        subagentRunId: ctx.subagentRunId,
        resume: ctx.resume,
        abortController: linkAbort(ctx.abortSignal),
        systemPrompts: [
          'You write blog posts in Markdown. Start with one # title. Use short ## sections and a closing line. When earlier messages contain research notes or SEO text, write only from those messages. Do not add facts that are not in those messages.',
        ],
      }),
  })

  const seoAgent = defineAgent({
    ...seo,
    run: (ctx) =>
      chat({
        adapter: createOpenRouterText('openai/gpt-5.5', apiKey),
        messages: ctx.messages,
        threadId: ctx.threadId,
        runId: ctx.runId,
        parentRunId: ctx.parentRunId,
        subagentRunId: ctx.subagentRunId,
        resume: ctx.resume,
        abortController: linkAbort(ctx.abortSignal),
        systemPrompts: [
          'You prepare SEO for a blog post. Reply in Markdown. Give 5 title options, one meta description under 160 characters, and a short tag list. Do not write the full article.',
        ],
      }),
  })

  return [researcherAgent, writerAgent, seoAgent] as const
}
