import { chat, defineAgent } from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'

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
  const researcher = defineAgent({
    name: 'researcher',
    description:
      'Does this turn need facts or sources? Answer yes when the user asks to look something up, even if they also ask for a draft or for SEO. Answer no when they do not ask to look anything up.',
    run: (ctx) =>
      chat({
        adapter: createOpenRouterText('openai/gpt-5.5', apiKey),
        messages: ctx.messages,
        threadId: ctx.threadId,
        runId: ctx.runId,
        parentRunId: ctx.parentRunId,
        resume: ctx.resume,
        abortController: linkAbort(ctx.abortSignal),
        systemPrompts: [
          'You research for a blog desk. Reply in Markdown with short notes and sources. Use a list. Do not write the full post.',
        ],
      }),
  })

  const writer = defineAgent({
    name: 'writer',
    description:
      'Does this turn need a written article, post, or rewrite? Answer yes only when the user asks for an article, post, draft, or rewrite. Answer no when they ask for research or SEO and do not ask for an article.',
    run: (ctx) =>
      chat({
        adapter: createOpenRouterText('openai/gpt-5.5', apiKey),
        messages: ctx.messages,
        threadId: ctx.threadId,
        runId: ctx.runId,
        parentRunId: ctx.parentRunId,
        resume: ctx.resume,
        abortController: linkAbort(ctx.abortSignal),
        systemPrompts: [
          'You write blog posts in Markdown. Start with one # title. Use short ## sections and a closing line. When earlier messages contain research notes or SEO text, write only from those messages. Do not add facts that are not in those messages.',
        ],
      }),
  })

  const seo = defineAgent({
    name: 'seo',
    description:
      'Does this turn need SEO work? Answer yes when the user asks for SEO, search titles, a meta description, or tags. Answer no when they do not mention SEO, titles, a meta description, or tags.',
    run: (ctx) =>
      chat({
        adapter: createOpenRouterText('openai/gpt-5.5', apiKey),
        messages: ctx.messages,
        threadId: ctx.threadId,
        runId: ctx.runId,
        parentRunId: ctx.parentRunId,
        resume: ctx.resume,
        abortController: linkAbort(ctx.abortSignal),
        systemPrompts: [
          'You prepare SEO for a blog post. Reply in Markdown. Give 5 title options, one meta description under 160 characters, and a short tag list. Do not write the full article.',
        ],
      }),
  })

  return [researcher, writer, seo] as const
}
