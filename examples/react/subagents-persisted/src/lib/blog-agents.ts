import { toolDefinition } from '@tanstack/ai'

// Shared by the server and the browser, so it holds no server code. The
// server adds `run` and the tool's `.server()` in `agents.ts`. The browser
// passes the list to the chat UI factory, which types each card from it.

// The researcher calls this tool, so its card shows a tool call and a result.
export const lookupWikipedia = toolDefinition({
  name: 'lookupWikipedia',
  description:
    'Get the Wikipedia summary of one topic. Pass a short page title, for example "Octopus".',
  inputSchema: {
    type: 'object',
    properties: { title: { type: 'string' } },
    required: ['title'],
  },
})

export const researcher = {
  name: 'researcher',
  description:
    'Does this turn need facts or sources? Answer yes when the user asks to look something up, even if they also ask for a draft or for SEO. Answer no when they do not ask to look anything up.',
  tools: [lookupWikipedia],
} as const

export const writer = {
  name: 'writer',
  description:
    'Does this turn need a written article, post, or rewrite? Answer yes only when the user asks for an article, post, draft, or rewrite. Answer no when they ask for research or SEO and do not ask for an article.',
} as const

export const seo = {
  name: 'seo',
  description:
    'Does this turn need SEO work? Answer yes when the user asks for SEO, search titles, a meta description, or tags. Answer no when they do not mention SEO, titles, a meta description, or tags.',
} as const

export const blogAgents = [researcher, writer, seo] as const
