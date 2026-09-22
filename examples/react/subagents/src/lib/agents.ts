import { chat, defineAgent } from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'

export function createBlogAgents(apiKey: string) {
  const researcher = defineAgent({
    name: 'researcher',
    description:
      'Does this turn need facts or sources? Answer yes when the user asks to look something up, even if they also ask for a draft.',
    run: (ctx) =>
      chat({
        adapter: createOpenRouterText('openai/gpt-5.5', apiKey),
        messages: ctx.messages,
        threadId: ctx.threadId,
        runId: ctx.runId,
        systemPrompts: [
          'You research for a blog desk. Reply in Markdown with short notes and sources. Use a list. Do not write the full post.',
        ],
      }),
  })

  const writer = defineAgent({
    name: 'writer',
    description:
      'Does this turn need a written article, post, or rewrite? Answer yes even if they also ask for research.',
    run: (ctx) =>
      chat({
        adapter: createOpenRouterText('openai/gpt-5.5', apiKey),
        messages: ctx.messages,
        threadId: ctx.threadId,
        runId: ctx.runId,
        systemPrompts: [
          'You write blog posts in Markdown. Start with one # title. Use short ## sections and a closing line. When earlier messages contain research notes, write only from those notes. Do not add facts that are not in the notes.',
        ],
      }),
  })

  const seo = defineAgent({
    name: 'seo',
    description:
      'Does this turn need SEO titles, a meta description, or tags? Answer yes when the user asks for search titles, descriptions, or tags, even if they also ask for research. Answer no when they only want facts or only want the article.',
    run: (ctx) =>
      chat({
        adapter: createOpenRouterText('openai/gpt-5.5', apiKey),
        messages: ctx.messages,
        threadId: ctx.threadId,
        runId: ctx.runId,
        systemPrompts: [
          'You prepare SEO for a blog post. Reply in Markdown. Give 5 title options, one meta description under 160 characters, and a short tag list. Do not write the full article.',
        ],
      }),
  })

  return [researcher, writer, seo] as const
}
