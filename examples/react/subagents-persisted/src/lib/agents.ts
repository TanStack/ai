import { chat, defineAgent, toolDefinition } from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'

// The researcher calls this tool, so its card shows a tool call and a result.
const lookupWikipedia = toolDefinition({
  name: 'lookupWikipedia',
  description:
    'Get the Wikipedia summary of one topic. Pass a short page title, for example "Octopus".',
  inputSchema: {
    type: 'object',
    properties: { title: { type: 'string' } },
    required: ['title'],
  },
}).server(async (input) => {
  const title =
    typeof input === 'object' &&
    input !== null &&
    'title' in input &&
    typeof input.title === 'string'
      ? input.title
      : ''
  const response = await fetch(
    `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`,
    { headers: { 'user-agent': 'tanstack-ai-subagents-persisted-example' } },
  )
  if (!response.ok) return { title, found: false }
  const page: unknown = await response.json()
  const extract =
    typeof page === 'object' &&
    page !== null &&
    'extract' in page &&
    typeof page.extract === 'string'
      ? page.extract
      : ''
  return {
    title,
    found: true,
    extract,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`,
  }
})

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
        modelOptions: { reasoning: { effort: 'medium' } },
        tools: [lookupWikipedia],
        messages: ctx.messages,
        threadId: ctx.threadId,
        runId: ctx.runId,
        parentRunId: ctx.parentRunId,
        resume: ctx.resume,
        abortController: linkAbort(ctx.abortSignal),
        systemPrompts: [
          'You research for a blog desk. Call lookupWikipedia once for each topic before you reply. Then reply in Markdown with short notes, and give the Wikipedia URL as the source. Use a list. Do not write the full post.',
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
